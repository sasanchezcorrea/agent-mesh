#!/usr/bin/env node
// agentmesh — removes state written outside the plugin's own files:
// the mode flag, the config file, and the statusLine entry it added to
// settings.json. Plugin files themselves are removed by each host's own
// uninstall command (see README); this only cleans up what those commands
// can't see.

const fs = require('fs');
const path = require('path');
const { getConfigPath, getClaudeDir } = require('../hooks/mesh-config');

const STATUSLINE_SCRIPTS = ['agentmesh-statusline', 'mesh-statusline'];

function removeIfExists(filePath, label) {
  try {
    fs.unlinkSync(filePath);
    console.log(`Removed ${label}: ${filePath}`);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

function writeSettingsAtomic(filePath, settings) {
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.tmp`,
  );
  const mode = fs.statSync(filePath).mode & 0o777;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(settings, null, 2)}\n`, { mode });
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try { fs.unlinkSync(tempPath); } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') throw cleanupError;
    }
    throw error;
  }
}

function isAgentmeshStatusLine(command) {
  return typeof command === 'string'
    && STATUSLINE_SCRIPTS.some(script => command.includes(script));
}

removeIfExists(path.join(getClaudeDir(), '.agentmesh-mode'), 'mode state');
removeIfExists(getConfigPath(), 'config file');
removeIfExists(path.join(getClaudeDir(), 'agentmesh-statusline.sh'), 'statusline script');

const settingsPath = path.join(getClaudeDir(), 'settings.json');
try {
  const raw = fs.readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, '');
  const settings = JSON.parse(raw);
  if (!settings || Array.isArray(settings) || typeof settings !== 'object') {
    throw new SyntaxError('settings.json must contain a JSON object');
  }
  const cmd = settings.statusLine && settings.statusLine.command;
  // Only remove the parts Agentmesh owns. If the user combined statuslines,
  // keep the other plugin's command intact. Splitting on && / ; is enough; a user
  // piping statuslines together is on their own.
  if (isAgentmeshStatusLine(cmd)) {
    const parts = cmd
      .split(/&&|;/)
      .map((s) => s.trim())
      .filter(Boolean);
    const others = parts.filter(s => !isAgentmeshStatusLine(s));
    if (others.length === 0) {
      delete settings.statusLine;
      writeSettingsAtomic(settingsPath, settings);
      console.log(`Removed Agentmesh statusLine entry from ${settingsPath}`);
    } else {
      settings.statusLine.command = others.join(' && ');
      writeSettingsAtomic(settingsPath, settings);
      console.log(`Removed Agentmesh statusLine segment from ${settingsPath}`);
    }
  }
} catch (e) {
  if (e.code === 'ENOENT') {
    // no settings.json — nothing to clean
  } else if (e instanceof SyntaxError) {
    // Malformed settings.json can't be safely edited; leave it intact and warn.
    console.warn(`settings.json is malformed — could not remove the Agentmesh statusLine entry. Remove it manually from: ${settingsPath} (${e.message})`);
  } else {
    throw e;
  }
}
