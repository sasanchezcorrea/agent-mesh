#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function shellCommand(commandPath) {
  if (process.platform === 'win32') {
    return `"${commandPath.replace(/(["^])/g, '^$1')}"`;
  }
  if (!/\s/.test(commandPath)) return commandPath;
  return `'${commandPath.replace(/'/g, "'\\''")}'`;
}

const [settingsPath, commandPath] = process.argv.slice(2);
if (!settingsPath || !commandPath) {
  console.error('Usage: node setup/update-statusline.js <settings.json> <command>');
  process.exitCode = 2;
} else {
  try {
    const exists = fs.existsSync(settingsPath);
    const raw = exists ? fs.readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, '') : '{}';
    const settings = JSON.parse(raw);
    if (!settings || Array.isArray(settings) || typeof settings !== 'object') {
      throw new Error('settings.json must contain a JSON object');
    }

    settings.statusLine = { type: 'command', command: shellCommand(commandPath) };
    const tempPath = path.join(
      path.dirname(settingsPath),
      `.${path.basename(settingsPath)}.${process.pid}.tmp`,
    );
    const mode = exists ? fs.statSync(settingsPath).mode & 0o777 : 0o600;
    fs.writeFileSync(tempPath, `${JSON.stringify(settings, null, 2)}\n`, { mode });
    fs.renameSync(tempPath, settingsPath);
  } catch (error) {
    console.error(`Could not update ${settingsPath}: ${error.message}`);
    process.exitCode = 1;
  }
}
