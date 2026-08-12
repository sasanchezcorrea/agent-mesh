# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-07-18

### Changed
- Mesh modes are now a synchronized stack conductor: one `/mesh <level>` drives
  the whole stack instead of being a standalone code-style layer. The level sets
  RTK compression (`--ultra-compact` at ultra) and best-effort drives the
  required Ponytail companion to the same level, so cost and precision are tuned
  in one place. Opt out of companion sync with `AGENTMESH_NO_PONYTAIL_SYNC=1`.
- De-duplicated the behavior layer against Ponytail on Claude Code and Copilot
  CLI: Ponytail owns the "write the least code" ladder and its `ponytail:`
  marker, so the mesh skill, hook fallback, and `AGENTS.md` no longer restate
  that policy. The VS Code instruction file keeps it as the sole carrier, since
  Ponytail is not installed there.

### Added
- Ponytail is now a required companion plugin on Claude Code and Copilot CLI.
  The installer adds it from the official marketplace when missing and
  `stack.lock.json` reports version drift without duplicating Ponytail's public
  commands or skills.
- VS Code now receives the managed global Agentmesh instruction file through
  its supported `~/.copilot/instructions` user-profile location.

## [0.1.1] - 2026-07-15

### Added
- A predefined CodeGraph-first/Serena-second routing policy across Claude
  Code, Copilot CLI, and VS Code. Serena remains the safe read fallback when
  CodeGraph has no usable index or lacks the necessary detail.

## [0.1.0] - 2026-07-11

Initial release.

### Added
- Single-plugin orchestration of the agent-tool stack: CodeGraph, AX, Engram,
  Serena (MCP servers) and RTK (PreToolUse hook), driven by `manifest.json`.
- `setup/install.sh` — one-command installer for the five underlying binaries
  plus agentmesh itself, with pinned, checksum-verified release downloads and a
  `--check` dry-run.
- `setup/register-mcp.js` — idempotent per-client MCP registration for Claude
  Code, Copilot CLI, and VS Code.
- Cost-aware mesh modes (`/mesh lite|full|ultra|off`) with a self-activating
  behavior layer and statusline badge.
- `/mesh-status`, `/mesh-cost`, and `/mesh-evaluate` commands.
- Self-healing `SessionStart` hook that registers the MCP stack when config
  drift is detected.
- Docker smoke test and Renovate/prek quality gates.

[0.1.2]: https://github.com/sasanchezcorrea/agentmesh/tree/v0.1.2
[0.1.1]: https://github.com/sasanchezcorrea/agentmesh/tree/v0.1.1
[0.1.0]: https://github.com/sasanchezcorrea/agentmesh/tree/v0.1.0
