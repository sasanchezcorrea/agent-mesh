#!/usr/bin/env node
// agentmesh — measures the MARGINAL (warmed-up) token/credit cost of each
// orchestrated MCP server in Copilot CLI: a trivial prompt, servers toggled
// on/off one at a time via --disable-mcp-server.
//
// mesh: this is the "already in a session" cost, not the cold-start one.
// GitHub's backend caches something shared across back-to-back calls (seen
// directly while building this: skipping the warm-up call made LATER
// measurements look cheaper than earlier ones, including impossible negative
// marginals). A warm-up call absorbs that so the real measurements are
// comparable to each other — but it also means this table will read lower
// than the cost of a brand-new terminal's very first message. For that
// fresh-session number, run this script itself as your first command after
// opening a new terminal (no warm-up will have happened yet).
//
// Claude Code and VS Code aren't measured here. Claude Code's CLI reports
// cache-aware usage differently (see docs/agentmesh.md); VS Code's Copilot
// Chat has no non-interactive flag to script this at all. Add a
// Claude-specific measurer if/when that becomes the bottleneck, not before.
'use strict';

const { spawnSync } = require('child_process');

const SERVERS = ['engram', 'ax', 'codegraph', 'serena'];
const PROMPT = 'Reply with exactly: OK';

function run(disableList) {
  const args = ['-p', PROMPT, '--allow-all-tools'];
  for (const s of disableList) args.push('--disable-mcp-server', s);
  // mesh: the human-readable usage footer (Tokens/AI Credits) is written to
  // stderr, not stdout — confirmed by inspecting both streams directly.
  // --output-format json exists but its "result" event only exposes
  // premiumRequests/duration, not the token/credit breakdown, so it can't
  // replace this for a per-server cost table.
  const result = spawnSync('copilot', args, { encoding: 'utf8', timeout: 60_000 });
  if (result.error) {
    throw new Error(`could not run copilot: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`copilot exited with status ${result.status}: ${(result.stderr || '').trim()}`);
  }
  return parseUsage(result.stderr);
}

function parseUsage(stderr) {
  const output = String(stderr || '');
  const tokens = output.match(/Tokens\s+↑\s*([\d.]+k?)/);
  const credits = output.match(/AI Credits\s+([\d.]+)/);
  if (!credits) {
    throw new Error('could not parse AI Credits from Copilot CLI output');
  }
  return {
    tokens: tokens ? tokens[1] : '?',
    credits: parseFloat(credits[1]),
  };
}

function main() {
  try {
    console.log('agentmesh cost report — Copilot CLI, marginal AI-credit cost per MCP server (warmed-up)\n');
    console.log('Running 7 measurements incl. warm-up (~1-2 min)...\n');

    // mesh: back-to-back calls to the same backend can hit a short-lived
    // cache that makes whichever config runs LAST look artificially cheaper —
    // observed directly while building this (negative marginal costs on a raw
    // first draft). One throwaway warm-up call absorbs that cold-start penalty
    // so it doesn't land on whichever real measurement happens to run first.
    run(SERVERS);

    const floor = run(SERVERS);
    const full = run([]);

    const rows = [];
    for (const server of SERVERS) {
      const others = SERVERS.filter(s => s !== server);
      const withOnlyThis = run(others);
      const marginal = withOnlyThis.credits - floor.credits;
      // A real per-server cost can't be negative — that's cache noise, not signal.
      rows.push({ server, credits: marginal > 0 ? marginal.toFixed(2) : '~0 (cache noise)' });
    }

    const totalTax = full.credits - floor.credits;

    console.log('Server       Marginal AI Credits (vs. zero-MCP floor)');
    console.log('----------   ------------------------------------------');
    for (const r of rows) console.log(`${r.server.padEnd(12)} ${r.credits}`);
    console.log('----------   ------------------------------------------');
    console.log(`floor        ${floor.credits.toFixed(2)}  (no MCP servers, custom instructions still load)`);
    console.log(`full stack   ${full.credits.toFixed(2)}  (all 4 servers active)`);
    console.log(`stack tax    ${totalTax > 0 ? '+' + totalTax.toFixed(2) : '~0 (cache noise)'} credits over the floor\n`);
    console.log('Single-sample, live measurement — GitHub\'s backend caching means a few credits');
    console.log('of run-to-run variance is normal. Run a few times if a number looks off; trust');
    console.log('the trend across runs over any single number.');
  } catch (error) {
    console.error(`agentmesh cost report failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { parseUsage, run, main };
