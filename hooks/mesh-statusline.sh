#!/usr/bin/env bash
# CLAUDE_CONFIG_DIR overrides ~/.claude, matching where Agentmesh writes state.
flag="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.agentmesh-mode"
[ -f "$flag" ] || exit 0

mode=$(head -n1 "$flag" | tr -d '[:space:]')

# ultra is the high-intensity mode; flag it amber so it stands out from the
# default green at a glance. The level is still in the text, so color is a
# redundant cue, not the only one.
color=108
[ "$mode" = "ultra" ] && color=173

if [ -z "$mode" ] || [ "$mode" = "full" ]; then
    printf '\033[38;5;%sm[MESH]\033[0m' "$color"
else
    printf '\033[38;5;%sm[MESH:%s]\033[0m' "$color" "$(printf '%s' "$mode" | tr '[:lower:]' '[:upper:]')"
fi
