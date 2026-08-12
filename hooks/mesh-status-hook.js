#!/usr/bin/env node
// agentmesh — SessionStart hook: static presence check for the 4 orchestrated
// MCP servers, with self-healing: if any are missing from this client's
// config, kick off `setup/register-mcp.js` in the background instead of just
// telling the user to run it by hand. This is what makes "install the
// plugin, then start using it" actually converge to "everything's wired up"
// without a separate manual step -- there is no genuine postinstall hook in
// either Claude Code's or Copilot CLI's plugin system (checked both --help
// outputs directly), so SessionStart (which does fire on first use after
// install) is the earliest real hook point available.
//
// mesh: the underlying 5 binaries (engram/ax/codegraph/serena/rtk) are
// NOT auto-installed here or anywhere in this repo -- silently running
// brew/uv/cargo installers without asking is a trust line this plugin
// doesn't cross. setup/install.sh tells you what's missing; you install it.
// Once the binary exists, THIS hook wires its registration automatically.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync, spawn } = require('child_process');
const { isCopilot, writeHookOutput } = require('./mesh-runtime');

const SERVERS = ['engram', 'ax', 'codegraph', 'serena'];
const PLUGIN_ROOT = path.join(__dirname, '..');
const client = isCopilot ? 'copilot' : 'claude';

function configuredServerNames() {
  try {
    let configPath;
    if (isCopilot) {
      configPath = path.join(os.homedir(), '.copilot', 'mcp-config.json');
    } else {
      // Claude Code user-scope servers live in ~/.claude.json under mcpServers.
      configPath = path.join(os.homedir(), '.claude.json');
    }
    if (!fs.existsSync(configPath)) return [];
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return Object.keys(config.mcpServers || {});
  } catch (e) {
    return [];
  }
}

// Avoid re-triggering a background fix every single session start once one
// is already in flight or was just attempted -- a marker file, not a lock,
// good enough for a best-effort hook.
function recentlyAttempted() {
  const identity = crypto
    .createHash('sha256')
    .update(`${os.homedir()}:${client}`)
    .digest('hex')
    .slice(0, 16);
  const marker = path.join(os.tmpdir(), `.agentmesh-register-attempt-${identity}`);
  try {
    const stat = fs.statSync(marker);
    if (Date.now() - stat.mtimeMs < 5 * 60 * 1000) return true;
    fs.unlinkSync(marker);
  } catch (e) {
    if (e.code !== 'ENOENT') return true;
  }
  try {
    fs.writeFileSync(marker, String(Date.now()), { flag: 'wx' });
    return false;
  } catch (e) {
    return e.code === 'EEXIST';
  }
}

function configuredForAllRepoCodegraph() {
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return fs.existsSync(path.join(configHome, 'agentmesh', 'codegraph-global'));
}

function currentRepository() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (e) {
    return null;
  }
}

function maybeIndexCurrentRepository() {
  if (!configuredForAllRepoCodegraph() || !commandExists('codegraph')) return;
  const repository = currentRepository();
  if (!repository || fs.existsSync(path.join(repository, '.codegraph'))) return;

  try {
    const child = spawn('codegraph', ['init', '--index', repository], {
      cwd: repository,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch (e) {
    // Indexing is opt-in and best-effort; never block session startup.
  }
}

function commandExists(command) {
  try {
    execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [command], {
      stdio: 'ignore',
    });
    return true;
  } catch (e) {
    return false;
  }
}

const present = new Set(configuredServerNames());
const lines = SERVERS.map(s => `${present.has(s) ? '✅' : '❌'} ${s}`);
const allPresent = SERVERS.every(s => present.has(s));

// Opt-out for anyone who doesn't want a hook silently spawning a background
// process on their machine -- also what tests use, so a test run never
// spawns a real process or touches the real marker file in os.tmpdir().
const autoRegisterDisabled = process.env.AGENTMESH_NO_AUTO_REGISTER === '1';

maybeIndexCurrentRepository();

let context = '';
if (!allPresent) {
  if (autoRegisterDisabled) {
    context = `agentmesh: missing MCP servers (${lines.join(', ')}). Auto-register is ` +
      `disabled (AGENTMESH_NO_AUTO_REGISTER=1) -- run \`node setup/register-mcp.js\` ` +
      `from the agentmesh plugin root by hand.`;
  } else if (!recentlyAttempted()) {
    // Fire-and-forget: register-mcp.js can take longer than a hook's timeout
    // allows (Claude Code's path shells out to `claude mcp` per server), so
    // this must not be awaited here.
    try {
      const child = spawn(
        process.execPath,
        [path.join(PLUGIN_ROOT, 'setup', 'register-mcp.js'), `--client=${client}`],
        { detached: true, stdio: 'ignore' },
      );
      child.unref();
      context = `agentmesh: found missing MCP servers (${lines.join(', ')}) -- ` +
        `auto-registering in the background now. Restart this session in a ` +
        `minute for them to connect, or run /mesh-status to check progress.`;
    } catch (e) {
      context = `agentmesh: missing MCP servers (${lines.join(', ')}) and the ` +
        `auto-register attempt itself failed. Run \`node setup/register-mcp.js\` ` +
        `from the agentmesh plugin root by hand.`;
    }
  } else {
    context = `agentmesh: still missing MCP servers (${lines.join(', ')}) after a ` +
      `recent auto-register attempt -- likely the underlying binary isn't ` +
      `installed yet. Run \`bash setup/install.sh\` to see which, install it, ` +
      `then restart this session.`;
  }
}
// mesh: everything present -- say nothing, don't nag every session start.

try {
  writeHookOutput('SessionStart', 'mesh-status', context);
} catch (e) {
  // Silent fail — a hook must never block session start.
}
