#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const manifest = require('../manifest.json');

const SERVERS = Object.keys(manifest.servers);
const PROMPT = 'Reply with exactly: OK';
const UNSUPPORTED = {
  vscode: 'VS Code Copilot Chat has no headless chat command with machine-readable usage telemetry',
  codex: 'Agentmesh does not yet register or isolate its MCP stack in Codex CLI',
};

function commandAvailable(command, spawn = spawnSync) {
  const locator = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawn(locator, [command], { encoding: 'utf8' });
  return !result.error && result.status === 0;
}

function parseProviderArg(argv = process.argv.slice(2)) {
  const arg = argv.find(value => value.startsWith('--provider='));
  return arg ? arg.slice('--provider='.length).toLowerCase() : 'auto';
}

function selectProvider(requested, adapters, env = process.env) {
  const provider = requested || 'auto';
  if (UNSUPPORTED[provider]) throw new Error(`${provider} is unsupported: ${UNSUPPORTED[provider]}`);
  if (provider !== 'auto') {
    if (!adapters[provider]) throw new Error(`unknown provider '${provider}' (use auto|copilot|claude|vscode|codex)`);
    if (!adapters[provider].available()) throw new Error(`${provider} CLI is not available on PATH`);
    return adapters[provider];
  }

  const preferred = env.COPILOT_PLUGIN_DATA
    ? 'copilot'
    : env.CLAUDECODE
      ? 'claude'
      : env.CODEX_THREAD_ID
        ? 'codex'
        : null;
  if (preferred && UNSUPPORTED[preferred]) {
    throw new Error(`${preferred} is unsupported: ${UNSUPPORTED[preferred]}`);
  }
  if (preferred) {
    if (!adapters[preferred].available()) throw new Error(`${preferred} CLI is not available on PATH`);
    return adapters[preferred];
  }

  for (const fallback of ['copilot', 'claude']) {
    if (adapters[fallback].available()) return adapters[fallback];
  }
  throw new Error('no supported provider CLI found on PATH (tried copilot and claude)');
}

function runProcess(command, args, spawn = spawnSync, env = process.env) {
  const result = spawn(command, args, { encoding: 'utf8', timeout: 60_000, env });
  if (result.error) throw new Error(`could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}: ${(result.stderr || '').trim()}`);
  }
  return result;
}

function parseCopilotUsage(stderr) {
  const output = String(stderr || '');
  const tokens = output.match(/Tokens\s+↑\s*([\d.]+k?)/);
  const credits = output.match(/AI Credits\s+([\d.]+)/);
  if (!credits) throw new Error('could not parse AI Credits from Copilot CLI output');
  return { tokens: tokens ? tokens[1] : '?', credits: Number.parseFloat(credits[1]) };
}

function runCopilot(disabledServers, spawn = spawnSync) {
  const args = ['-p', PROMPT, '--allow-all-tools'];
  for (const server of disabledServers) args.push('--disable-mcp-server', server);
  return parseCopilotUsage(runProcess('copilot', args, spawn).stderr);
}

function buildClaudeMcpConfig(activeServers) {
  const mcpServers = {};
  for (const name of activeServers) {
    const definition = manifest.servers[name];
    if (!definition) throw new Error(`unknown MCP server '${name}'`);
    const args = [...definition.args];
    if (definition.contextArgByClient?.claude) args.splice(1, 0, definition.contextArgByClient.claude);
    mcpServers[name] = { type: 'stdio', command: definition.command, args };
  }
  return { mcpServers };
}

function buildClaudeArgs(activeServers) {
  return [
    '-p', PROMPT,
    '--output-format', 'json',
    '--no-session-persistence',
    '--max-turns', '1',
    '--permission-mode', 'dontAsk',
    '--settings', JSON.stringify({ disableAllHooks: true }),
    '--strict-mcp-config',
    '--mcp-config', JSON.stringify(buildClaudeMcpConfig(activeServers)),
  ];
}

function parseClaudeUsage(stdout) {
  let payload;
  try {
    payload = JSON.parse(String(stdout || ''));
  } catch {
    throw new Error('could not parse Claude Code JSON output');
  }
  if (payload.is_error === true || (payload.subtype && payload.subtype !== 'success')) {
    throw new Error(`Claude Code measurement failed: ${payload.result || payload.subtype || 'unknown error'}`);
  }
  if (!payload.usage || typeof payload.usage !== 'object') {
    throw new Error('Claude Code JSON output is missing usage telemetry');
  }
  const usage = payload.usage;
  const usageKeys = [
    'input_tokens', 'inputTokens',
    'cache_creation_input_tokens', 'cacheCreationInputTokens',
    'cache_read_input_tokens', 'cacheReadInputTokens',
    'output_tokens', 'outputTokens',
  ];
  if (!usageKeys.some(key => Object.hasOwn(usage, key))) {
    throw new Error('Claude Code JSON output is missing usage telemetry');
  }
  const read = (snake, camel) => Number(usage[snake] ?? usage[camel] ?? 0);
  const parsed = {
    inputTokens: read('input_tokens', 'inputTokens'),
    cacheCreationInputTokens: read('cache_creation_input_tokens', 'cacheCreationInputTokens'),
    cacheReadInputTokens: read('cache_read_input_tokens', 'cacheReadInputTokens'),
    outputTokens: read('output_tokens', 'outputTokens'),
    costUsd: payload.total_cost_usd == null ? null : Number(payload.total_cost_usd),
  };
  parsed.inputFootprint = parsed.inputTokens
    + parsed.cacheCreationInputTokens
    + parsed.cacheReadInputTokens;
  if (!Number.isFinite(parsed.inputFootprint) || (parsed.costUsd != null && !Number.isFinite(parsed.costUsd))) {
    throw new Error('Claude Code JSON output contains invalid usage values');
  }
  return parsed;
}

function runClaude(activeServers, spawn = spawnSync) {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  const result = runProcess('claude', buildClaudeArgs(activeServers), spawn, env);
  return parseClaudeUsage(result.stdout);
}

function measure(adapter) {
  adapter.warmup?.();
  const floor = adapter.run([]);
  const full = adapter.run(SERVERS);
  const perServer = Object.fromEntries(SERVERS.map(server => [server, adapter.run([server])]));
  return { floor, full, perServer };
}

function nonNegative(value, digits = 0) {
  return value > 0 ? value.toFixed(digits) : '~0 (cache noise)';
}

function renderCopilot({ floor, full, perServer }, options = {}) {
  const lines = options.header === false ? [] : [
    'agentmesh cost report — Copilot CLI, marginal AI-credit cost per MCP server (warmed-up)', '',
  ];
  lines.push(
    'Server       Marginal AI Credits (vs. zero-MCP floor)',
    '----------   ------------------------------------------',
  );
  for (const server of SERVERS) {
    lines.push(`${server.padEnd(12)} ${nonNegative(perServer[server].credits - floor.credits, 2)}`);
  }
  const totalTax = full.credits - floor.credits;
  lines.push(
    '----------   ------------------------------------------',
    `floor        ${floor.credits.toFixed(2)}  (no MCP servers, custom instructions still load)`,
    `full stack   ${full.credits.toFixed(2)}  (all ${SERVERS.length} servers active)`,
    `stack tax    ${totalTax > 0 ? `+${totalTax.toFixed(2)}` : '~0 (cache noise)'} credits over the floor`,
    '',
    'Single-sample, live measurement — GitHub backend caching creates run-to-run variance.',
  );
  return lines.join('\n');
}

function formatUsd(value) {
  return value == null ? 'n/a' : `$${value.toFixed(6)}`;
}

function renderClaude({ floor, full, perServer }, options = {}) {
  const lines = options.header === false ? [] : [
    'agentmesh cost report — Claude Code, marginal input-token footprint per MCP server (cache-aware)', '',
  ];
  lines.push(
    'Server       Input tokens   Marginal sample USD',
    '----------   ------------   -------------------',
  );
  for (const server of SERVERS) {
    const sample = perServer[server];
    const tokenDelta = sample.inputFootprint - floor.inputFootprint;
    const usdDelta = sample.costUsd == null || floor.costUsd == null ? null : sample.costUsd - floor.costUsd;
    lines.push(`${server.padEnd(12)} ${nonNegative(tokenDelta).padEnd(14)} ${usdDelta > 0 ? formatUsd(usdDelta) : usdDelta == null ? 'n/a' : '~0'}`);
  }
  const totalTax = full.inputFootprint - floor.inputFootprint;
  lines.push(
    '----------   ------------   -------------------',
    `floor        ${String(floor.inputFootprint).padEnd(12)} ${formatUsd(floor.costUsd)}  (no MCP servers)`,
    `full stack   ${String(full.inputFootprint).padEnd(12)} ${formatUsd(full.costUsd)}  (all ${SERVERS.length} servers active)`,
    `stack tax    ${totalTax > 0 ? `+${totalTax}` : '~0 (cache/tool-search noise)'} input tokens over the floor`,
    '',
    `Cache mix (full): ${full.inputTokens} uncached + ${full.cacheCreationInputTokens} write + ${full.cacheReadInputTokens} read input tokens.`,
    'Claude defers MCP schemas through tool search by default; this measures the idle registered-stack footprint, not later tool discovery or tool output.',
  );
  return lines.join('\n');
}

function createAdapters(spawn = spawnSync) {
  return {
    copilot: {
      id: 'copilot',
      title: 'agentmesh cost report — Copilot CLI, marginal AI-credit cost per MCP server (warmed-up)',
      available: () => commandAvailable('copilot', spawn),
      warmup: () => runCopilot(SERVERS, spawn),
      run: activeServers => runCopilot(SERVERS.filter(server => !activeServers.includes(server)), spawn),
      render: renderCopilot,
      measurementCount: 7,
    },
    claude: {
      id: 'claude',
      title: 'agentmesh cost report — Claude Code, marginal input-token footprint per MCP server (cache-aware)',
      available: () => commandAvailable('claude', spawn),
      run: activeServers => runClaude(activeServers, spawn),
      render: renderClaude,
      measurementCount: 6,
    },
  };
}

function main() {
  try {
    const argumentProvider = parseProviderArg();
    const requested = argumentProvider === 'auto'
      ? process.env.AGENTMESH_COST_PROVIDER || 'auto'
      : argumentProvider;
    const adapter = selectProvider(requested, createAdapters());
    console.log(adapter.title);
    console.log(`Running ${adapter.measurementCount} measurements (~1-2 min)...\n`);
    console.log(adapter.render(measure(adapter), { header: false }));
  } catch (error) {
    console.error(`agentmesh cost report failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  SERVERS,
  UNSUPPORTED,
  buildClaudeArgs,
  buildClaudeMcpConfig,
  createAdapters,
  measure,
  parseClaudeUsage,
  parseCopilotUsage,
  parseProviderArg,
  parseUsage: parseCopilotUsage,
  renderClaude,
  renderCopilot,
  runClaude,
  runCopilot,
  selectProvider,
};
