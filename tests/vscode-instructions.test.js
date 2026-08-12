#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.join(__dirname, '..');
const script = path.join(root, 'setup', 'install-vscode-instructions.js');

function withTempHome(run) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmesh-vscode-test-'));
  try {
    run(home);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

function install(home, ...args) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
}

function targetPath(home) {
  return path.join(home, '.copilot', 'instructions', 'agentmesh.instructions.md');
}

test('installs an idempotent global VS Code instruction file', () => {
  withTempHome((home) => {
    const first = install(home);
    assert.equal(first.status, 0, first.stderr);

    const target = targetPath(home);
    const content = fs.readFileSync(target, 'utf8');
    assert.match(content, /^---\nname: Agentmesh\n/);
    assert.match(content, /applyTo: "\*\*"/);
    assert.match(content, /<!-- Managed by Agentmesh\. -->/);
    assert.match(content, /You are a lazy senior developer/);
    assert.match(content, /CodeGraph first/);
    assert.match(content, /Serena second/);

    const second = install(home);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /already configured/);
  });
});

test('does not overwrite an unmanaged global VS Code instruction file', () => {
  withTempHome((home) => {
    const target = targetPath(home);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'user-owned instructions\n');

    const result = install(home);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Refusing to overwrite unmanaged instruction file/);
    assert.equal(fs.readFileSync(target, 'utf8'), 'user-owned instructions\n');
  });
});

test('checks global VS Code instructions without creating them', () => {
  withTempHome((home) => {
    const result = install(home, '--check');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /VS Code instructions: missing/);
    assert.equal(fs.existsSync(targetPath(home)), false);
  });
});
