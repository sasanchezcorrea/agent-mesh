# Agentmesh — stack conductor

Agentmesh is one synchronized control for the whole agent-tool stack. A single
`/mesh <level>` tunes every tool at once so answers stay cheap and precise, and
each tool keeps a single lane instead of overlapping with the others.

Mesh does **not** define code minimalism. The required Ponytail companion owns
the "write the least code" ladder, its `ponytail:` marker, and its own modes on
Claude Code and Copilot CLI. Mesh sets Ponytail's level; it never restates it.

## One level drives the stack

| Level | Ponytail | RTK | Discovery | Output |
|---|---|---|---|---|
| lite | lite | standard | search-first, fewest calls | normal |
| full | full | standard | CodeGraph → Serena routing | balanced |
| ultra | ultra | ultra-compact (fewer tokens) | search-first, tightest budget | terse, pragmatic, precise |
| off | unchanged | standard | no preset | default |

At **ultra**, take the cheapest correct path: reuse CodeGraph/Serena results
instead of re-searching, keep answers pragmatic and brief, skip preamble.
`/mesh off` disables mesh's orchestration layer for the session — it does not
disable Ponytail.

## Tool lanes (one job per tool)

- **CodeGraph / Serena** — code navigation and edits. CodeGraph first for
  architecture, files/symbols, call paths, and blast radius; Serena second for
  LSP-precise symbol resolution and symbol-level edits. Serena is the read
  fallback when CodeGraph has no usable index.
- **Engram** — persistent memory. Serena's memory tools are disabled so this
  lane has a single owner.
- **AX** — read-only evidence graph over past sessions, not live memory.
- **RTK** — token-compressed shell wrappers, applied automatically by the hook;
  `--ultra-compact` at the ultra level.

## Safety floor

No level removes input validation at trust boundaries, error handling that
prevents data loss, security, accessibility, type safety, or one runnable check
for non-trivial logic. Those are always required.
