---
name: mesh
description: >
  Agentmesh stack-orchestration modes: route across the tool stack and keep
  tool and token usage proportional. Ponytail owns code minimalism.
argument-hint: "[lite|full|ultra|off]"
license: MIT
---

# Agentmesh mode

Agentmesh is one synchronized control for the whole tool stack: a single level
tunes every tool at once so answers stay cheap and precise. Code minimalism is
**not** restated here — the required Ponytail companion owns the "write the
least code" ladder, its `ponytail:` shortcut marker, and its own modes. Mesh
sets Ponytail's level; it does not duplicate that policy.

## Persistence

The active mode applies to every response until changed or disabled. Default:
**full**. Switch with `/mesh lite|full|ultra|off`.

## Default CodeGraph/Serena routing

Use one discovery path per task; do not ask both tools the same discovery
question.

1. **CodeGraph first** for repository architecture, relevant files and symbols,
   call paths, callers/callees, and blast-radius analysis before a risky edit.
2. **Serena second** after CodeGraph narrows the target: use its LSP-aware
   symbol lookup, references, implementations, and symbol-level edits
   (`rename`, `replace`, `insert`, or safe delete).
3. Use Serena for read-only discovery only when CodeGraph has no usable index,
   is stale, or lacks the required detail. Use raw search only after either
   tool cannot answer the question.

## Tool lanes

Each tool owns one lane; do not use two for the same job.

- **CodeGraph / Serena** — code navigation and edits (routed above).
- **Engram** — persistent memory. Serena's memory tools are disabled to keep
  this lane single-owner.
- **AX** — read-only evidence graph over past sessions, not live memory.
- **RTK** — token-compressed shell wrappers, applied automatically by the hook.

## Modes — one level for the whole stack

A mesh mode is a single intensity every tool follows at once, so cost and
precision are tuned in one place. `/mesh <level>` drives the stack:

| Level | Ponytail | RTK | Discovery | Output |
|---|---|---|---|---|
| **lite** | lite | standard | search-first, fewest calls | normal |
| **full** | full | standard | CodeGraph → Serena routing | balanced |
| **ultra** | ultra | ultra-compact (fewer tokens) | search-first, tightest budget | terse, pragmatic, precise |

Mesh sets Ponytail's level and RTK's compression for you; it never restates
Ponytail's ladder. At **ultra**, take the cheapest correct path: reuse
CodeGraph/Serena results instead of re-searching, keep answers pragmatic and
brief, and skip preamble. `/mesh off` disables this orchestration layer for the
session (it does not disable Ponytail).

## Safety floor

Modes never remove input validation, error handling, security, accessibility,
type safety, or tests for non-trivial logic. Those are always required.

## Output

Lead with the result. Keep explanations short unless the user explicitly asks
for a report, walkthrough, or design discussion.
