---
name: mesh-cost
description: >
  Live AI-credit/token cost dashboard for the orchestrated MCP stack
  (CodeGraph, AX, Engram, Serena) in Copilot CLI. One-shot report, not a
  persistent mode. Trigger: /mesh-cost, "what is the MCP stack costing me",
  "show token savings", "agentmesh cost report".
---

# Mesh Cost

Runs `dashboard/cost-report.js`, which re-measures (live, not cached from a
previous run) the marginal AI-credit cost of each orchestrated MCP server by
toggling `--disable-mcp-server` per server and diffing against a warmed-up
floor.

Report the script's output verbatim. Do not round further, do not invent a
number if the script fails — surface the exact error instead.

## Why this exists

Registering CodeGraph, AX, Engram, and Serena (see `manifest.json`) as MCP
servers means their tool schemas are sent to the model on every turn. That has
a real, measurable fixed cost. This command makes that cost visible on demand
instead of it being an invisible tax nobody looks at.

## What it does NOT measure

- Claude Code and VS Code — Copilot CLI only (see the script's own header
  comment for why).
- True cold-start cost — the script includes a warm-up call so the 4
  per-server numbers are comparable to each other; a brand-new terminal's
  very first message is typically more expensive than any number in this
  table. Run the script itself as your first command in a fresh terminal if
  you need that specific figure.

## Related

- `/mesh-status` — which servers are connected right now (not what they cost).
- `/mesh-evaluate` — whether each connected component earns its cost.
