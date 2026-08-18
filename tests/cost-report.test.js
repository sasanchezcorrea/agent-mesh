const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SERVERS,
  buildClaudeArgs,
  buildClaudeMcpConfig,
  measure,
  parseClaudeUsage,
  parseCopilotUsage,
  parseProviderArg,
  renderClaude,
  renderCopilot,
  runClaude,
  runCopilot,
  selectProvider,
} = require('../dashboard/cost-report');

test('parses Copilot usage output', () => {
  assert.deepEqual(
    parseCopilotUsage('Tokens ↑ 1.2k\nAI Credits 3.5'),
    { tokens: '1.2k', credits: 3.5 },
  );
});

test('rejects missing Copilot credits instead of returning NaN', () => {
  assert.throws(
    () => parseCopilotUsage('Copilot failed before printing usage'),
    /could not parse AI Credits/,
  );
});

test('parses cache-aware Claude JSON usage', () => {
  assert.deepEqual(
    parseClaudeUsage(JSON.stringify({
      total_cost_usd: 0.012345,
      usage: {
        input_tokens: 12,
        cache_creation_input_tokens: 300,
        cache_read_input_tokens: 400,
        output_tokens: 2,
      },
    })),
    {
      inputTokens: 12,
      cacheCreationInputTokens: 300,
      cacheReadInputTokens: 400,
      outputTokens: 2,
      costUsd: 0.012345,
      inputFootprint: 712,
    },
  );
});

test('accepts Claude camelCase usage and missing USD estimate', () => {
  assert.deepEqual(
    parseClaudeUsage(JSON.stringify({
      usage: {
        inputTokens: 2,
        cacheCreationInputTokens: 3,
        cacheReadInputTokens: 5,
        outputTokens: 1,
      },
    })),
    {
      inputTokens: 2,
      cacheCreationInputTokens: 3,
      cacheReadInputTokens: 5,
      outputTokens: 1,
      costUsd: null,
      inputFootprint: 10,
    },
  );
});

test('rejects malformed Claude JSON', () => {
  assert.throws(() => parseClaudeUsage('not json'), /could not parse Claude Code JSON/);
});

test('rejects Claude failures and missing usage instead of reporting a zero sample', () => {
  assert.throws(
    () => parseClaudeUsage(JSON.stringify({ subtype: 'error_max_turns', is_error: true, result: 'failed' })),
    /Claude Code measurement failed: failed/,
  );
  assert.throws(
    () => parseClaudeUsage(JSON.stringify({ type: 'result', subtype: 'success' })),
    /missing usage telemetry/,
  );
  assert.throws(
    () => parseClaudeUsage(JSON.stringify({ type: 'result', subtype: 'success', usage: {} })),
    /missing usage telemetry/,
  );
});

test('builds an isolated Claude MCP config from the manifest', () => {
  const config = buildClaudeMcpConfig(['engram', 'serena']);
  assert.deepEqual(Object.keys(config.mcpServers), ['engram', 'serena']);
  assert.equal(config.mcpServers.engram.command, 'engram');
  assert.deepEqual(
    config.mcpServers.serena.args,
    ['start-mcp-server', '--context=claude-code', '--project-from-cwd'],
  );
  assert.throws(() => buildClaudeMcpConfig(['unknown']), /unknown MCP server/);
});

test('Claude invocation is non-persistent, hook-free, and strict about MCP config', () => {
  const args = buildClaudeArgs(['ax']);
  assert.equal(args[args.indexOf('--no-session-persistence')], '--no-session-persistence');
  assert.equal(args[args.indexOf('--strict-mcp-config')], '--strict-mcp-config');
  assert.deepEqual(JSON.parse(args[args.indexOf('--settings') + 1]), { disableAllHooks: true });
  assert.deepEqual(
    Object.keys(JSON.parse(args[args.indexOf('--mcp-config') + 1]).mcpServers),
    ['ax'],
  );
});

test('explicit and host-derived provider selection is deterministic', () => {
  const adapters = {
    copilot: { id: 'copilot', available: () => true },
    claude: { id: 'claude', available: () => true },
  };
  assert.equal(selectProvider('claude', adapters, {}).id, 'claude');
  assert.equal(selectProvider('auto', adapters, { CLAUDECODE: '1' }).id, 'claude');
  assert.equal(selectProvider('auto', adapters, { COPILOT_PLUGIN_DATA: '/tmp/plugin' }).id, 'copilot');
  assert.equal(selectProvider('auto', adapters, {}).id, 'copilot');
});

test('provider selection fails loudly for unknown, unsupported, and unavailable clients', () => {
  const adapters = {
    copilot: { id: 'copilot', available: () => false },
    claude: { id: 'claude', available: () => false },
  };
  assert.throws(() => selectProvider('gemini', adapters, {}), /unknown provider/);
  assert.throws(() => selectProvider('vscode', adapters, {}), /vscode is unsupported/);
  assert.throws(() => selectProvider('auto', adapters, { CODEX_THREAD_ID: '1' }), /codex is unsupported/);
  assert.throws(() => selectProvider('claude', adapters, {}), /claude CLI is not available/);
  assert.throws(() => selectProvider('auto', adapters, {}), /no supported provider CLI/);
});

test('parses the provider flag without changing the default command', () => {
  assert.equal(parseProviderArg([]), 'auto');
  assert.equal(parseProviderArg(['--provider=Claude']), 'claude');
});

test('shared measurement runner preserves floor, full, and per-server isolation', () => {
  const calls = [];
  const adapter = {
    warmup: () => calls.push('warmup'),
    run: active => {
      calls.push([...active]);
      return { active: [...active] };
    },
  };
  const result = measure(adapter);
  assert.deepEqual(calls, ['warmup', [], SERVERS, ...SERVERS.map(server => [server])]);
  assert.deepEqual(result.floor, { active: [] });
  assert.deepEqual(result.full, { active: SERVERS });
});

test('Copilot adapter disables every server except the active set', () => {
  let invocation;
  const spawn = (command, args) => {
    invocation = { command, args };
    return { status: 0, stderr: 'Tokens ↑ 1.0k\nAI Credits 2.5', stdout: '' };
  };
  assert.deepEqual(runCopilot(['ax', 'serena'], spawn), { tokens: '1.0k', credits: 2.5 });
  assert.equal(invocation.command, 'copilot');
  assert.deepEqual(
    invocation.args.filter(arg => SERVERS.includes(arg)),
    ['ax', 'serena'],
  );
});

test('Claude adapter removes nested-session marker and parses stdout', () => {
  let invocation;
  const spawn = (command, args, options) => {
    invocation = { command, args, options };
    return {
      status: 0,
      stderr: '',
      stdout: JSON.stringify({
        total_cost_usd: 0.01,
        usage: { input_tokens: 1, cache_creation_input_tokens: 2, cache_read_input_tokens: 3 },
      }),
    };
  };
  const original = process.env.CLAUDECODE;
  process.env.CLAUDECODE = '1';
  try {
    assert.equal(runClaude(['engram'], spawn).inputFootprint, 6);
  } finally {
    if (original == null) delete process.env.CLAUDECODE;
    else process.env.CLAUDECODE = original;
  }
  assert.equal(invocation.command, 'claude');
  assert.equal(invocation.options.env.CLAUDECODE, undefined);
  assert.deepEqual(
    Object.keys(JSON.parse(invocation.args[invocation.args.indexOf('--mcp-config') + 1]).mcpServers),
    ['engram'],
  );
});

test('renderers keep provider-native units explicit', () => {
  const copilotReport = renderCopilot({
    floor: { credits: 1 },
    full: { credits: 3 },
    perServer: Object.fromEntries(SERVERS.map((server, index) => [server, { credits: 1.1 + index }])),
  });
  assert.match(copilotReport, /AI Credits/);
  assert.match(copilotReport, /stack tax    \+2.00 credits/);

  const usage = (inputFootprint, costUsd) => ({
    inputTokens: inputFootprint,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 1,
    inputFootprint,
    costUsd,
  });
  const claudeReport = renderClaude({
    floor: usage(100, 0.01),
    full: usage(160, 0.02),
    perServer: Object.fromEntries(SERVERS.map((server, index) => [server, usage(110 + index, 0.011)])),
  });
  assert.match(claudeReport, /input-token footprint/);
  assert.match(claudeReport, /Cache mix \(full\)/);
  assert.match(claudeReport, /stack tax    \+60 input tokens/);
});
