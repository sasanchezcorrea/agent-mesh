#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.join(__dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'stack.lock.json'), 'utf8'));

function writeExecutable(file, body) {
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`);
  fs.chmodSync(file, 0o755);
}

function runCheck({ copilotHasPonytail }) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmesh-stack-test-'));
  const bin = path.join(temp, 'bin');
  fs.mkdirSync(bin);

  try {
    for (const spec of Object.values(lock.tools)) {
      if (spec.command) {
        writeExecutable(path.join(bin, spec.command), `printf '%s\\n' '${spec.version}'`);
      }
    }

    writeExecutable(
      path.join(bin, 'claude'),
      `if [ "$1" = plugin ] && [ "$2" = list ]; then
         printf '%s\\n' 'Installed plugins:' '  ponytail@ponytail' '    Version: ${lock.tools.ponytail.version}'
       fi`,
    );
    writeExecutable(
      path.join(bin, 'copilot'),
      `if [ "$1" = plugin ] && [ "$2" = list ]; then
         printf '%s\\n' 'Installed plugins:'
         ${copilotHasPonytail ? `printf '%s\\n' '  ponytail@ponytail (v${lock.tools.ponytail.version})'` : ''}
       fi`,
    );

    return spawnSync(process.execPath, [path.join(root, 'setup', 'check-stack.js')], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

test('stack check accepts the required Ponytail plugin on both native hosts', () => {
  const result = runCheck({ copilotHasPonytail: true });
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /✅ ponytail \(claude\): 4\.8\.4/);
  assert.match(result.stdout, /✅ ponytail \(copilot\): 4\.8\.4/);
});

test('stack check fails when Ponytail is missing from a detected native host', () => {
  const result = runCheck({ copilotHasPonytail: false });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /❌ ponytail \(copilot\): missing \(expected 4\.8\.4\)/);
});
