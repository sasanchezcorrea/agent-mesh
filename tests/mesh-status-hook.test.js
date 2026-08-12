#!/usr/bin/env node
// agentmesh — tests for hooks/mesh-status-hook.js: the config-presence check
// that runs on SessionStart alongside Agentmesh's activation hook.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');

function runHook(home, copilot) {
  const env = { ...process.env, HOME: home, AGENTMESH_NO_AUTO_REGISTER: '1' };
  if (copilot) env.COPILOT_PLUGIN_DATA = path.join(home, '.copilot-plugin-data');
  else delete env.COPILOT_PLUGIN_DATA;
  return spawnSync(process.execPath, [path.join(root, 'hooks', 'mesh-status-hook.js')], {
    env,
    encoding: 'utf8',
  });
}

function withTempHome(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmesh-test-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// All 4 servers present (Copilot config) -> silent, no nag.
withTempHome(dir => {
  fs.mkdirSync(path.join(dir, '.copilot'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.copilot', 'mcp-config.json'),
    JSON.stringify({ mcpServers: { engram: {}, ax: {}, codegraph: {}, serena: {} } })
  );
  const { stdout, status } = runHook(dir, true);
  assert.equal(status, 0);
  assert.equal(JSON.parse(stdout).additionalContext, undefined, 'expected no nag when all servers present');
});

// Missing servers (Copilot config) -> warns, names the missing ones, and
// says auto-register is disabled (since tests always set that env var).
withTempHome(dir => {
  fs.mkdirSync(path.join(dir, '.copilot'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.copilot', 'mcp-config.json'),
    JSON.stringify({ mcpServers: { engram: {} } })
  );
  const { stdout, status } = runHook(dir, true);
  assert.equal(status, 0);
  const ctx = JSON.parse(stdout).additionalContext;
  assert.ok(ctx.includes('❌ ax'), 'expected ax flagged missing');
  assert.ok(ctx.includes('❌ codegraph'), 'expected codegraph flagged missing');
  assert.ok(ctx.includes('❌ serena'), 'expected serena flagged missing');
  assert.ok(ctx.includes('✅ engram'), 'expected engram flagged present');
  assert.ok(ctx.includes('AGENTMESH_NO_AUTO_REGISTER'), 'expected disabled-mode message when opted out');
});

// No config file at all -> warns (everything missing), doesn't throw.
withTempHome(dir => {
  const { stdout, status } = runHook(dir, true);
  assert.equal(status, 0);
  const ctx = JSON.parse(stdout).additionalContext;
  assert.ok(ctx.includes('❌ engram') && ctx.includes('❌ serena'));
});

console.log('mesh-status-hook.test.js: all assertions passed');
