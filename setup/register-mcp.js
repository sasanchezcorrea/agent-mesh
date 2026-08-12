#!/usr/bin/env node
// agentmesh — registers the orchestrated MCP stack (manifest.json) into
// Copilot CLI, VS Code, and/or Claude Code. Idempotent: safe to re-run.
//
// Usage: node setup/register-mcp.js --client=all|copilot|vscode|claude
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const MANIFEST_PATH = path.join(__dirname, '..', 'manifest.json');
const SERENA_CONFIG_PATH = process.env.SERENA_CONFIG_PATH
  || path.join(os.homedir(), '.serena', 'serena_config.yml');

function resolveBin(name) {
  try {
    const locator = process.platform === 'win32' ? 'where.exe' : 'which';
    const result = execFileSync(locator, [name], { encoding: 'utf8' }).trim();
    return result.split(/\r?\n/, 1)[0];
  } catch {
    return null;
  }
}

function loadManifest() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8').replace(/^\uFEFF/, ''));
  if (!manifest || typeof manifest !== 'object' || !manifest.servers || typeof manifest.servers !== 'object') {
    throw new Error('manifest.json must contain a servers object');
  }
  return manifest;
}

function readJsonObject(configPath, fallback) {
  if (!fs.existsSync(configPath)) return fallback;
  const value = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${configPath} must contain a JSON object`);
  }
  return value;
}

function writeAtomic(filePath, content, mode = null) {
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.tmp`,
  );
  try {
    fs.writeFileSync(tempPath, content, mode === null ? undefined : { mode });
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try { fs.unlinkSync(tempPath); } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') throw cleanupError;
    }
    throw error;
  }
}

function writeJsonAtomic(filePath, value) {
  const mode = fs.existsSync(filePath) ? fs.statSync(filePath).mode & 0o777 : 0o600;
  writeAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`, mode);
}

function snapshotFiles(filePaths) {
  return filePaths.map(filePath => ({
    filePath,
    exists: fs.existsSync(filePath),
    content: fs.existsSync(filePath) ? fs.readFileSync(filePath) : null,
    mode: fs.existsSync(filePath) ? fs.statSync(filePath).mode & 0o777 : 0o600,
  }));
}

function restoreSnapshots(snapshots) {
  for (const snapshot of snapshots) {
    if (snapshot.exists) {
      writeAtomic(snapshot.filePath, snapshot.content, snapshot.mode);
    } else if (fs.existsSync(snapshot.filePath)) {
      fs.unlinkSync(snapshot.filePath);
    }
  }
}

function buildArgs(def, client) {
  const args = [...def.args];
  if (def.contextArgByClient && def.contextArgByClient[client]) {
    args.splice(1, 0, def.contextArgByClient[client]);
  }
  return args;
}

// ---- Copilot CLI: direct JSON merge on ~/.copilot/mcp-config.json ----
function applyCopilot(manifest) {
  const configPath = path.join(os.homedir(), '.copilot', 'mcp-config.json');
  const config = readJsonObject(configPath, { mcpServers: {} });
  if (!config.mcpServers || typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)) {
    throw new Error(`${configPath}.mcpServers must be an object`);
  }

  for (const [name, def] of Object.entries(manifest.servers)) {
    const bin = resolveBin(def.command);
    if (!bin) { console.log(`  skip ${name}: '${def.command}' not on PATH (run setup/install.sh)`); continue; }
    const args = buildArgs(def, 'copilot');
    config.mcpServers[name] = { type: 'local', command: bin, args, tools: ['*'] };
    console.log(`  ${name} -> ${bin} ${args.join(' ')}`);
  }
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  writeJsonAtomic(configPath, config);
}

// ---- VS Code: direct JSON merge on mcp.json, preserving unrelated servers ----
function vscodeMcpPath() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'mcp.json');
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'Code',
      'User',
      'mcp.json',
    );
  }
  // Verified against the real, official Microsoft VS Code CLI (apt package
  // from packages.microsoft.com, not a stub): as a non-root user with no
  // prior VS Code state, `code --add-mcp` itself writes to and reads from
  // exactly this path. Also confirmed round-trip compatibility: this
  // script's own output (with an explicit "type": "stdio" VS Code's CLI
  // omits by default but tolerates) survived `code --add-mcp` adding a 5th
  // server alongside it, unchanged.
  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
    'Code',
    'User',
    'mcp.json',
  );
}

function applyVscode(manifest) {
  const configPath = vscodeMcpPath();
  const config = readJsonObject(configPath, { servers: {} });
  if (!config.servers || typeof config.servers !== 'object' || Array.isArray(config.servers)) {
    throw new Error(`${configPath}.servers must be an object`);
  }

  for (const [name, def] of Object.entries(manifest.servers)) {
    const bin = resolveBin(def.command);
    if (!bin) { console.log(`  skip ${name}: '${def.command}' not on PATH (run setup/install.sh)`); continue; }
    const args = buildArgs(def, 'vscode');
    config.servers[name] = { type: 'stdio', command: bin, args };
    console.log(`  ${name} -> ${bin} ${args.join(' ')}`);
  }
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  writeJsonAtomic(configPath, config);
}

// ---- Claude Code: shell out to the supported `claude mcp` CLI ----
// Always remove-then-add: simpler and just as idempotent as detecting drift,
// with no dependency on parsing `claude mcp get` output.
function applyClaude(manifest) {
  const failures = [];
  for (const [name, def] of Object.entries(manifest.servers)) {
    const bin = resolveBin(def.command);
    if (!bin) { console.log(`  skip ${name}: '${def.command}' not on PATH (run setup/install.sh)`); continue; }
    const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
    const snapshots = snapshotFiles([
      path.join(os.homedir(), '.claude.json'),
      path.join(claudeConfigDir, 'settings.json'),
    ]);
    try { execFileSync('claude', ['mcp', 'remove', '--scope', 'user', name], { encoding: 'utf8' }); } catch { /* wasn't registered */ }
    const args = buildArgs(def, 'claude');
    try {
      execFileSync('claude', ['mcp', 'add', '--scope', 'user', name, '--', bin, ...args], { encoding: 'utf8' });
      console.log(`  ${name} -> ${bin} ${args.join(' ')}`);
    } catch (e) {
      try {
        restoreSnapshots(snapshots);
      } catch (restoreError) {
        console.log(`  FAILED to restore ${name}: ${restoreError.message}`);
      }
      console.log(`  FAILED to register ${name}: ${e.message}`);
      failures.push(`${name}: ${e.message}`);
    }
  }
  if (failures.length) {
    throw new Error(failures.join('; '));
  }
}

// ---- Serena's excludedTools is a global setting, not per-client MCP registration ----
function applySerenaExclusions(manifest) {
  const serena = manifest.servers.serena;
  if (!serena || !fs.existsSync(SERENA_CONFIG_PATH)) return;
  const wanted = serena.excludedTools || [];
  const raw = fs.readFileSync(SERENA_CONFIG_PATH, 'utf8');
  const lines = raw.split(/\r?\n/);
  const existing = new Set();
  let start = -1;
  let end = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*excluded_tools:\s*(.*)$/);
    if (!match) continue;
    start = index;
    end = index + 1;
    const inline = match[1].trim();
    if (inline.startsWith('[') && inline.endsWith(']')) {
      for (const value of inline.slice(1, -1).split(',')) {
        const item = value.trim().replace(/^['"]|['"]$/g, '');
        if (item) existing.add(item);
      }
    }
    while (end < lines.length) {
      const itemMatch = lines[end].match(/^\s*-\s+(.+?)\s*$/);
      if (!itemMatch) break;
      existing.add(itemMatch[1].replace(/^['"]|['"]$/g, ''));
      end += 1;
    }
    break;
  }
  const merged = [...new Set([...existing, ...wanted])];
  const block = merged.length
    ? `excluded_tools:\n${merged.map(t => `- ${t}`).join('\n')}`
    : 'excluded_tools: []';
  const updatedLines = start >= 0
    ? [...lines.slice(0, start), ...block.split('\n'), ...lines.slice(end)]
    : [...lines, '', ...block.split('\n')];
  const updated = updatedLines.join('\n');
  if (updated !== raw) {
    const mode = fs.statSync(SERENA_CONFIG_PATH).mode & 0o777;
    writeAtomic(SERENA_CONFIG_PATH, updated, mode);
    console.log(`  serena_config.yml: excluded_tools updated (${wanted.length} tools)`);
  } else {
    console.log('  serena_config.yml: excluded_tools already up to date');
  }
}

function main() {
  const clientArg = (process.argv.find(a => a.startsWith('--client=')) || '--client=all').split('=')[1];
  const targets = clientArg === 'all' ? ['copilot', 'vscode', 'claude'] : [clientArg];
  try {
    const manifest = loadManifest();

    for (const target of targets) {
      console.log(`\n== ${target} ==`);
      if (target === 'copilot') applyCopilot(manifest);
      else if (target === 'vscode') applyVscode(manifest);
      else if (target === 'claude') applyClaude(manifest);
      else throw new Error(`unknown client: ${target} (use copilot|vscode|claude|all)`);
    }

    console.log('\n== serena excluded_tools (global) ==');
    applySerenaExclusions(manifest);
    console.log('\nDone. Run `node dashboard/cost-report.js` to measure the result.');
  } catch (error) {
    console.error(`MCP registration failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  applyClaude,
  applyCopilot,
  applySerenaExclusions,
  applyVscode,
  buildArgs,
  loadManifest,
  resolveBin,
  vscodeMcpPath,
  writeAtomic,
};
