#!/usr/bin/env node
// agentmesh — regression test for setup/register-mcp.js's applyCopilot():
// found via a from-scratch sandbox test (fresh container, no prior Copilot
// CLI usage) that ~/.copilot/ not existing yet crashed the write with ENOENT
// -- fs.mkdirSync(recursive: true) was missing before the writeFileSync.
// On a real dev machine this never surfaced because ~/.copilot/ already
// existed from normal Copilot CLI use, which is exactly why a from-scratch
// sandbox run is worth doing instead of only testing on an already-set-up
// machine.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');

function withTempHome(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmesh-register-test-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

withTempHome(dir => {
  // Deliberately do NOT create dir/.copilot -- that's the from-scratch case.
  assert.ok(!fs.existsSync(path.join(dir, '.copilot')), 'test setup: .copilot must not pre-exist');

  const result = spawnSync(
    process.execPath,
    [path.join(root, 'setup', 'register-mcp.js'), '--client=copilot'],
    { env: { ...process.env, HOME: dir }, encoding: 'utf8' },
  );

  assert.equal(result.status, 0, `register-mcp.js should exit 0 on a from-scratch HOME, got stderr: ${result.stderr}`);
  const configPath = path.join(dir, '.copilot', 'mcp-config.json');
  assert.ok(fs.existsSync(configPath), 'expected mcp-config.json to be created even though .copilot/ did not exist yet');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.ok(config.mcpServers, 'expected an mcpServers object in the written config');
});

withTempHome(dir => {
  const copilotDir = path.join(dir, '.copilot');
  fs.mkdirSync(copilotDir, { recursive: true });
  const configPath = path.join(copilotDir, 'mcp-config.json');
  const original = '{ invalid json';
  fs.writeFileSync(configPath, original);

  const result = spawnSync(
    process.execPath,
    [path.join(root, 'setup', 'register-mcp.js'), '--client=copilot'],
    { env: { ...process.env, HOME: dir }, encoding: 'utf8' },
  );

  assert.equal(result.status, 1, 'malformed config must fail clearly');
  assert.match(result.stderr, /MCP registration failed/);
  assert.equal(fs.readFileSync(configPath, 'utf8'), original, 'malformed config must remain untouched');
});

withTempHome(dir => {
  const serenaDir = path.join(dir, '.serena');
  fs.mkdirSync(serenaDir, { recursive: true });
  const serenaConfig = path.join(serenaDir, 'serena_config.yml');
  fs.writeFileSync(serenaConfig, 'excluded_tools:\n- user_custom_tool\n');

  const result = spawnSync(
    process.execPath,
    [path.join(root, 'setup', 'register-mcp.js'), '--client=copilot'],
    {
      env: {
        ...process.env,
        HOME: dir,
        SERENA_CONFIG_PATH: serenaConfig,
      },
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const updated = fs.readFileSync(serenaConfig, 'utf8');
  assert.match(updated, /- user_custom_tool/);
  assert.match(updated, /- write_memory/);
});

withTempHome(dir => {
  const binDir = path.join(dir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  for (const command of ['engram', 'ax', 'codegraph', 'serena']) {
    const commandPath = path.join(binDir, command);
    fs.writeFileSync(commandPath, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(commandPath, 0o755);
  }
  const claudePath = path.join(binDir, 'claude');
  fs.writeFileSync(
    claudePath,
    '#!/bin/sh\nif [ "$2" = "add" ]; then exit 1; fi\nexit 0\n',
  );
  fs.chmodSync(claudePath, 0o755);

  const configPath = path.join(dir, '.claude.json');
  const original = '{"mcpServers":{"engram":{"command":"old"}}}\n';
  fs.writeFileSync(configPath, original);
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'setup', 'register-mcp.js'), '--client=claude'],
    {
      env: {
        ...process.env,
        HOME: dir,
        PATH: `${binDir}:${process.env.PATH}`,
      },
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 1, 'Claude registration failure must be reported');
  assert.equal(fs.readFileSync(configPath, 'utf8'), original, 'failed registration must restore user config');
});

console.log('register-mcp.test.js: all assertions passed');
