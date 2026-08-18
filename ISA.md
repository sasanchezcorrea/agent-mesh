---
task: Make mesh-cost provider-adapted
slug: 20260818-provider-adapted-cost
phase: complete
progress: 13/13
started: 2026-08-18
updated: 2026-08-18
principal_stated_goal: "implementala entonces para que esto quede provider adapted"
current_state: "mesh-cost hard-codes Copilot CLI flags, output parsing, and AI Credit units."
ideal_state: "mesh-cost selects a supported client adapter, reports native metrics honestly, and explains unsupported clients."
capabilities_invoked:
  - ISA
  - ponytail
  - mesh-cost
---

# Provider-adapted Mesh Cost

## Problem

`/mesh-cost` presents itself as stack cost visibility, but the implementation only invokes Copilot CLI. Claude Code is a supported Agentmesh host and now exposes the telemetry and MCP-isolation controls needed for equivalent measurement.

## Vision

One command measures the current supported host using that host's real units and caching model. Adding another scriptable host requires one adapter, while hosts without usable telemetry fail with a precise reason.

## Out of Scope

This feature does not invent cross-vendor currency conversion, scrape interactive UIs, or claim support for clients that cannot run reproducible headless measurements.
It also does not add Agentmesh installation support for new hosts as part of the cost-report change.

## Constraints

- Preserve `node dashboard/cost-report.js` and existing Copilot output behavior.
- Use only standard-library code and existing repository dependencies.
- Never mutate a user's persistent MCP configuration to run a measurement.
- Never report a fabricated or cross-provider-normalized cost.

## Goal

Make `mesh-cost` provider-adapted for Agentmesh's scriptable hosts, beginning with fully working Copilot and Claude Code adapters, automatic or explicit provider selection, native-unit reporting, and explicit unsupported-client behavior.
The existing command remains compatible while its result names the provider and metric semantics precisely.

## Criteria

- [x] ISC-1: An explicit supported provider flag selects its matching adapter.
- [x] ISC-2: Automatic selection chooses the invoking or installed supported CLI deterministically.
- [x] ISC-3: Anti: an unknown provider exits with an explicit error.
- [x] ISC-4: Anti: an unavailable provider exits with an explicit error.
- [x] ISC-5: Anti: an unsupported provider exits with an explicit error.
- [x] ISC-6: Copilot executes the existing seven-run warmed experiment.
- [x] ISC-7: Claude executes six experiment samples.
- [x] ISC-8: Claude parses cache-aware input-token telemetry from JSON output.
- [x] ISC-9: Claude measurement performs no persistent configuration write.
- [x] ISC-10: Each renderer labels its provider-native metric.
- [x] ISC-11: Adapter tests complete without paid model calls.
- [x] ISC-12: Public documentation names every supported host accurately.
- [x] ISC-13: Public documentation names every unsupported host accurately.

## Features

- **F1 · Provider selection:** the same public command routes to the client that can produce the measurement, with explicit errors for clients that cannot.
- **F2 · Native provider measurements:** Copilot preserves its AI Credit experiment while Claude uses isolated MCP JSON and cache-aware usage telemetry.
- **F3 · Regression and documentation:** fixture-driven tests and public text keep the provider contract honest without invoking paid models.

## Test Strategy

| isc | type | check | threshold | tool | anchors_to |
|---|---|---|---|---|---|
| ISC-1 | test | Provider selection fixtures | pass | `node --test tests/cost-report.test.js` | literal |
| ISC-2 | test | Auto-selection environment and installed-CLI fixtures | pass | `node --test tests/cost-report.test.js` | derived: automatic routing |
| ISC-3 | test | Unknown-provider assertion | pass | `node --test tests/cost-report.test.js` | derived: honest routing |
| ISC-4 | test | Unavailable-provider assertion | pass | `node --test tests/cost-report.test.js` | derived: honest routing |
| ISC-5 | command | Unsupported-provider process path | exit 1 | `node dashboard/cost-report.js --provider=vscode` | derived: honest routing |
| ISC-6 | test | Existing Copilot parser and call-sequence assertions | pass | `node --test tests/cost-report.test.js` | literal |
| ISC-7 | test | Claude generated config and call-sequence assertions | pass | `node --test tests/cost-report.test.js` | literal |
| ISC-8 | test | Claude cache-token fixture parsing | pass | `node --test tests/cost-report.test.js` | derived: native Claude metrics |
| ISC-9 | inspection | Claude adapter uses inline ephemeral config only | no persistent config writes | `rg -n "strict-mcp-config|mcp-config|writeFile" dashboard/cost-report.js` | derived: configuration safety |
| ISC-10 | test | Provider-specific renderer assertions | pass | `node --test tests/cost-report.test.js` | derived: native units |
| ISC-11 | command | Full repository checks use fixtures | exit 0 | `bun run check` | derived: regression safety |
| ISC-12 | inspection | Supported-provider wording sweep | Copilot and Claude named | `rg -n "Copilot|Claude" README.md skills commands docs` | derived: user contract |
| ISC-13 | inspection | Unsupported-provider wording sweep | VS Code and Codex named | `rg -n "VS Code|Codex" README.md skills commands docs` | derived: user contract |

## Decisions

- 2026-08-18: Use one shared experiment runner plus plain adapter objects; no factory, dependency, or speculative provider interface hierarchy.
- 2026-08-18: Report provider-native metrics. Copilot AI Credits and Claude cache-aware token/USD usage are not normalized into a fake common currency.
- 2026-08-18: VS Code remains explicitly unsupported because it has no reproducible headless chat/usage surface; provider adaptation means honest adapters, not fabricated universality.
- 2026-08-18: Claude uses strict inline MCP configuration, disables hooks, and avoids session persistence. Bare mode was rejected because it would also bypass the user's normal authenticated environment.
- 2026-08-18: Thirteen claims are intentionally below the E3 soft floor of 32 because the change is bounded to one script, its tests, and contract text; splitting further would manufacture duplicate probes rather than improve falsifiability.

## Learning

- **Conjectured:** strict MCP configuration alone was sufficient to isolate a Claude measurement.
  **Refuted by:** non-bare headless runs can still load configured hooks and plugins.
  **Learned:** hooks could mutate registration during measurement, while bare mode would discard the normal authenticated environment.
  **Criterion now:** Claude combines strict inline MCP configuration, disabled hooks, and no session persistence.

## Verification

- ISC-1 — PASS: explicit provider-selection fixtures select Copilot and Claude adapters.
- ISC-2 — PASS: host-marker and installed-CLI fixtures establish deterministic automatic selection.
- ISC-3 — PASS: unknown-provider fixture throws the named-provider error.
- ISC-4 — PASS: unavailable-provider fixture throws instead of falling back.
- ISC-5 — PASS: `--provider=vscode` returned the documented error with exit status 1.
- ISC-6 — PASS: Copilot parser, disable-list, and seven-call sequence tests passed.
- ISC-7 — PASS: shared runner and Claude adapter tests produced six isolated samples.
- ISC-8 — PASS: snake_case, camelCase, cache, USD, malformed, and failure payload fixtures passed.
- ISC-9 — PASS: inspection found strict inline MCP arguments and no filesystem-write API in the dashboard.
- ISC-10 — PASS: both renderer assertions passed with provider-native labels.
- ISC-11 — PASS: `bun run check` passed all 43 repository tests without provider calls.
- ISC-12 — PASS: README, skill, command, docs, and changelog name Copilot and Claude support.
- ISC-13 — PASS: public contract names VS Code and Codex as unsupported with reasons.
