---
name: mesh-status
description: >
  Live connection status for the orchestrated MCP stack (CodeGraph, AX,
  Engram, Serena) plus RTK and the active agentmesh mode, in the current client
  and session.
  One-shot report, not a persistent mode. Trigger: /mesh-status, "what tools
  are active", "is agentmesh working", "check the tool stack".
---

# Mesh Status

Reports, for the current session only:

- **CodeGraph, AX, Engram, Serena** — connected or not, by checking the live
  tool list (not `manifest.yaml`, which describes intent, not runtime state).
- **RTK** — whether a shell-command-rewriting hook is wired for this client
  (a hook, not a tool, so this checks hook config, not the tool list).
- **Agentmesh** — current mode (`lite`/`full`/`ultra`/`off`), per `/mesh`.

One-shot, do NOT change mode, write flag files, or persist anything.

## Why this exists

`manifest.yaml` says what agentmesh *should* register. This command answers
"is it actually working, right now, in this exact client" — the same check
done by hand across three clients before agentmesh existed.

## Related

- `/mesh-cost` — what the connected servers are costing (not whether they're
  connected).
