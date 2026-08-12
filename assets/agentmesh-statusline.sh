#!/usr/bin/env bash
# tiny status line: shows cumulative tokens saved by rtk, nothing else
have(){ command -v "$1" >/dev/null 2>&1; }
have rtk || exit 0
saved=$(rtk gain -f json 2>/dev/null | grep -o '"total_saved": *[0-9]*' | grep -o '[0-9]*$')
[ -z "$saved" ] && exit 0
if [ "$saved" -ge 1000000 ]; then fmt="$(awk "BEGIN{printf \"%.1fM\", $saved/1000000}")"
elif [ "$saved" -ge 1000 ]; then fmt="$(awk "BEGIN{printf \"%.0fk\", $saved/1000}")"
else fmt="$saved"; fi
printf '💾 saved %stk' "$fmt"
