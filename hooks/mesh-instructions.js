#!/usr/bin/env node
// Shared agentmesh mode instruction builder for Claude and Copilot hooks.

const fs = require('fs');
const path = require('path');
const { DEFAULT_MODE, normalizeMode, normalizePersistedMode } = require('./mesh-config');

const SKILL_PATH = path.join(__dirname, '..', 'skills', 'mesh', 'SKILL.md');
const TOOL_ROUTING =
  '## Default CodeGraph/Serena routing\n\n' +
  'Use one discovery path per task; do not ask both tools the same discovery question.\n\n' +
  '1. **CodeGraph first** for repository architecture, relevant files and symbols, call paths, callers/callees, and blast-radius analysis before a risky edit.\n' +
  '2. **Serena second** after CodeGraph narrows the target: use its LSP-aware symbol lookup, references, implementations, and symbol-level edits.\n' +
  '3. Use Serena for read-only discovery only when CodeGraph has no usable index, is stale, or lacks the required detail. Use raw search only after either tool cannot answer the question.\n\n';

function filterSkillBodyForMode(body, mode) {
  const effectiveMode = normalizeMode(mode) || DEFAULT_MODE;
  const withoutFrontmatter = String(body || '').replace(/^---[\s\S]*?---\s*/, '');

  // Only the intensity table rows and worked examples are mode-specific, and
  // both are keyed by a mode name (lite/full/ultra). A bullet whose label is
  // not a mode — e.g. "No unrequested abstractions: ..." — is a normal rule
  // and must be kept verbatim.
  return withoutFrontmatter
    .split(/\r?\n/)
    .filter((line) => {
      const tableLabel = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/);
      if (tableLabel) {
        const labelMode = normalizeMode(tableLabel[1].trim());
        if (labelMode) return labelMode === effectiveMode;
      }

      // Require a quoted value: every worked example is `- lite: "..."`. Without
      // this, an ordinary rule bullet that happens to start with a mode word
      // (e.g. "- Full: ...") is silently dropped in every other mode — it looks
      // like a worked example but is really prose meant to survive verbatim.
      const exampleLabel = line.match(/^-\s*([^:]+):\s*"/);
      if (exampleLabel) {
        const labelMode = normalizeMode(exampleLabel[1].trim());
        if (labelMode) return labelMode === effectiveMode;
      }

      return true;
    })
    .join('\n');
}

const MODE_STACK = {
  lite: { ponytail: 'lite', rtk: 'standard compression', discovery: 'search-first, fewest calls', output: 'normal' },
  full: { ponytail: 'full', rtk: 'standard compression', discovery: 'CodeGraph → Serena routing', output: 'balanced' },
  ultra: { ponytail: 'ultra', rtk: 'ultra-compact (fewer tokens)', discovery: 'search-first, tightest budget', output: 'terse, pragmatic, precise' },
};

function getFallbackInstructions(mode) {
  const stack = MODE_STACK[mode] || MODE_STACK[DEFAULT_MODE];
  return 'AGENTMESH MODE ACTIVE — level: ' + mode + '\n\n' +
    'Agentmesh is one synchronized control for the whole tool stack: a single level ' +
    'tunes every tool at once so answers stay cheap and precise. Code minimalism is owned ' +
    'by the required Ponytail companion — mesh sets its level, it does not restate its ladder.\n\n' +
    '## Persistence\n\n' +
    'ACTIVE EVERY RESPONSE until changed or disabled. Switch: `/mesh lite|full|ultra`. ' +
    'Off only: "stop mesh" or `/mesh off`.\n\n' +
    'Current level: **' + mode + '** — Ponytail: ' + stack.ponytail + '; RTK: ' + stack.rtk +
    '; discovery: ' + stack.discovery + '; output: ' + stack.output + '.\n\n' +
    TOOL_ROUTING +
    '## Tool lanes\n\n' +
    'One lane per tool; do not use two for the same job. CodeGraph/Serena for code navigation ' +
    'and edits (routed above). Engram for persistent memory — Serena\'s memory tools stay ' +
    'disabled to keep this lane single-owner. AX for the read-only evidence graph over past ' +
    'sessions, not live memory. RTK for token-compressed shell wrappers, applied by the hook.\n\n' +
    '## Modes\n\n' +
    'One level drives the stack: **lite** lightest touch, fewest calls; **full** balanced ' +
    'routing; **ultra** maximum cost discipline — Ponytail ultra, RTK ultra-compact, reuse ' +
    'prior CodeGraph/Serena results instead of re-searching, terse and pragmatic output. ' +
    'Levels never lower the safety floor.\n\n' +
    '## Safety floor\n\n' +
    'No level removes input validation at trust boundaries, error handling that prevents ' +
    'data loss, security, accessibility, type safety, or one runnable check for non-trivial ' +
    'logic. Those are always required.\n\n' +
    '## Output\n\n' +
    'Lead with the result. Keep explanations short unless the user explicitly asks for a ' +
    'report, walkthrough, or design discussion.\n\n' +
    '## Boundaries\n\n' +
    'Agentmesh governs stack engagement and cost, not code minimalism (Ponytail\'s axis) ' +
    'or how you talk. "stop mesh" or `/mesh off`: revert. Level persists until changed or ' +
    'session end.';
}

function getMeshInstructions(mode) {
  const configuredMode = normalizePersistedMode(mode) || DEFAULT_MODE;

  const effectiveMode = normalizeMode(configuredMode) || DEFAULT_MODE;

  try {
    return 'AGENTMESH MODE ACTIVE — level: ' + effectiveMode + '\n\n' +
      filterSkillBodyForMode(fs.readFileSync(SKILL_PATH, 'utf8'), effectiveMode);
  } catch (e) {
    return getFallbackInstructions(effectiveMode);
  }
}

module.exports = {
  filterSkillBodyForMode,
  getFallbackInstructions,
  getMeshInstructions,
};
