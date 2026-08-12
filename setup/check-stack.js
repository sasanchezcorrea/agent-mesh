#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'stack.lock.json'), 'utf8'));

function versionOf(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.error || result.status !== 0) {
    return null;
  }
  const match = (result.stdout || '').match(/\d+\.\d+\.\d+/);
  return match ? match[0] : null;
}

function pluginVersionOf(host, plugin) {
  const result = spawnSync(host, ['plugin', 'list'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.error && result.error.code === 'ENOENT') {
    return { available: false, version: null };
  }
  if (result.error || result.status !== 0) {
    return { available: true, version: null };
  }

  const output = result.stdout || '';
  const escapedPlugin = plugin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const multilineVersion = output.match(
    new RegExp(`${escapedPlugin}[\\s\\S]{0,200}?Version:\\s*v?(\\d+\\.\\d+\\.\\d+)`, 'i'),
  );
  const inlineVersion = output.match(
    new RegExp(`${escapedPlugin}\\s*\\(v?(\\d+\\.\\d+\\.\\d+)\\)`, 'i'),
  );
  return { available: true, version: (multilineVersion || inlineVersion)?.[1] || null };
}

let drift = false;
console.log(`agentmesh ${lock.agentmesh}`);
for (const [name, spec] of Object.entries(lock.tools)) {
  if (spec.plugin) {
    let foundHost = false;
    for (const host of spec.hosts) {
      const { available, version } = pluginVersionOf(host, spec.plugin);
      if (!available) continue;

      foundHost = true;
      if (!version) {
        console.log(`  ❌ ${name} (${host}): missing (expected ${spec.version})`);
        drift = true;
      } else if (version !== spec.version) {
        console.log(`  ⚠️  ${name} (${host}): ${version} (lock expects ${spec.version})`);
        drift = true;
      } else {
        console.log(`  ✅ ${name} (${host}): ${version}`);
      }
    }
    if (!foundHost) {
      console.log(`  ⏭️  ${name}: no supported plugin host detected`);
    }
    continue;
  }

  const actual = versionOf(spec.command);
  if (!actual) {
    console.log(`  ❌ ${name}: missing (expected ${spec.version})`);
    drift = true;
  } else if (actual !== spec.version) {
    console.log(`  ⚠️  ${name}: ${actual} (lock expects ${spec.version})`);
    drift = true;
  } else {
    console.log(`  ✅ ${name}: ${actual}`);
  }
}

process.exitCode = drift ? 1 : 0;
