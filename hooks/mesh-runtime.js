const fs = require('fs');
const path = require('path');
const { getClaudeDir } = require('./mesh-config');

const STATE_FILE = '.agentmesh-mode';
// Ponytail's own session state file. Agentmesh resolves stateDir with the exact
// same rule Ponytail uses (COPILOT_PLUGIN_DATA on Copilot, getClaudeDir() on
// Claude), so writing this file here is what Ponytail reads on its next turn.
const COMPANION_STATE_FILE = '.ponytail-active';
const COMPANION_MODES = new Set(['lite', 'full', 'ultra']);
const isCopilot = Boolean(process.env.COPILOT_PLUGIN_DATA);

const stateDir = isCopilot ? process.env.COPILOT_PLUGIN_DATA : getClaudeDir();

const statePath = path.join(stateDir, STATE_FILE);
const companionStatePath = path.join(stateDir, COMPANION_STATE_FILE);

function setMode(mode) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, mode);
}

// Drive the required Ponytail companion to the same level so a single /mesh
// command tunes the whole stack (the conductor contract). Deliberate, defensive
// coupling: Ponytail shares Agentmesh's state directory and the identical
// off/lite/full/ultra vocabulary, so this writes a level Ponytail understands.
// It is strictly best-effort — any failure, or a future Ponytail rename, degrades
// silently and never breaks the mesh hook. `off` is intentionally not propagated:
// disabling mesh's orchestration layer must not also strip Ponytail's minimal-code
// policy. Opt out entirely with AGENTMESH_NO_PONYTAIL_SYNC=1.
function syncCompanionMode(mode) {
  if (process.env.AGENTMESH_NO_PONYTAIL_SYNC) return;
  const normalized = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
  if (!COMPANION_MODES.has(normalized)) return;
  try {
    fs.mkdirSync(path.dirname(companionStatePath), { recursive: true });
    fs.writeFileSync(companionStatePath, normalized);
  } catch (e) {
    // Best-effort companion sync — never surface as a hook failure.
  }
}

function clearMode() {
  try { fs.unlinkSync(statePath); } catch (e) {}
}

// Live mode written by activate/mode-tracker. Absent state = agentmesh off.
function readMode() {
  try {
    return fs.readFileSync(statePath, 'utf8').trim() || null;
  } catch (e) {
    return null;
  }
}

function writeHookOutput(event, mode, context = '') {
  if (isCopilot) {
    // Copilot reads additionalContext on SessionStart; ignores output elsewhere.
    process.stdout.write(JSON.stringify(
      event === 'SessionStart' && context ? { additionalContext: context } : {}));
    return;
  }
  // Native Claude: SessionStart accepts raw stdout, but SubagentStart needs the
  // hookSpecificOutput JSON form or the context is dropped.
  if (event === 'SubagentStart') {
    process.stdout.write(JSON.stringify(
      { hookSpecificOutput: { hookEventName: event, additionalContext: context } }));
    return;
  }
  process.stdout.write(context);
}

module.exports = {
  clearMode,
  isCopilot,
  readMode,
  setMode,
  syncCompanionMode,
  writeHookOutput,
};
