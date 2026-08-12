#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const ignored = new Set(['.git', 'node_modules']);
const files = [];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(file);
    else if (/\.(js|sh)$/.test(entry.name)) files.push(file);
  }
}

collect(root);

for (const file of files) {
  const command = file.endsWith('.js') ? process.execPath : 'bash';
  const args = file.endsWith('.js') ? ['--check', file] : ['-n', file];
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
