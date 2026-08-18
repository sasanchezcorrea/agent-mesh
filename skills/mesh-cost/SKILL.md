---
name: mesh-cost
description: >
  Provider-adapted cost dashboard for the orchestrated MCP stack
  (CodeGraph, AX, Engram, Serena) in Copilot CLI or Claude Code. One-shot
  report, not a persistent mode. Trigger: /mesh-cost, "what is the MCP stack costing me",
  "show token savings", "agentmesh cost report".
---

# Mesh Cost

Runs `dashboard/cost-report.js`, which detects the invoking provider and
re-measures the marginal cost of each orchestrated MCP server against a
zero-MCP floor. Override detection with `--provider=copilot|claude` or
`AGENTMESH_COST_PROVIDER`.

Report the script's output verbatim. Do not round further, do not invent a
number if the script fails — surface the exact error instead.

## Why this exists

Registering CodeGraph, AX, Engram, and Serena (see `manifest.json`) adds host-
specific context and discovery overhead. This command makes the real idle
registered-stack footprint visible without pretending every provider exposes
the same units.

## Provider semantics

- **Copilot CLI** — 7 calls including one warm-up; reports marginal AI Credits
  using `--disable-mcp-server`.
- **Claude Code** — 6 isolated, non-persistent calls; reports the marginal
  input-token footprint and the client-estimated USD sample when present.
  Claude defers tool schemas through tool search, so this is the idle registered
  footprint, not later tool discovery or tool output.

## What it does NOT measure

- VS Code Copilot Chat — it has no headless chat command with machine-readable
  usage telemetry.
- Codex CLI — Agentmesh does not yet register or isolate its MCP stack there.
- True cold-start cost — the script includes a warm-up call so the 4
  per-server numbers are comparable to each other; a brand-new terminal's
  very first message is typically more expensive than any number in this
  table. Run the script itself as your first command in a fresh terminal if
  you need that specific figure.

## Related

- `/mesh-status` — which servers are connected right now (not what they cost).
- `/mesh-evaluate` — whether each connected component earns its cost.
