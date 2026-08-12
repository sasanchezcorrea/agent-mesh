#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${AGENTMESH_TEST_IMAGE:-node:22-bookworm}"

docker run --rm \
  -e CI=1 \
  -v "$ROOT:/workspace:ro" \
  -w /workspace \
  "$IMAGE" \
  bash -lc '
    set -euo pipefail
    mkdir -p /tmp/fake-bin /tmp/agentmesh-home
    for command in code engram ax codegraph serena rtk; do
      printf "#!/bin/sh\nexit 0\n" > "/tmp/fake-bin/$command"
      chmod +x "/tmp/fake-bin/$command"
    done
    cat > /tmp/fake-bin/claude <<'"'"'EOF'"'"'
#!/bin/sh
if [ "$1" = plugin ] && [ "$2" = list ]; then
  printf "%s\n" "Installed plugins:"
  [ -f "$HOME/.ponytail-claude" ] && printf "%s\n" "  ponytail@ponytail" "    Version: 4.8.4"
  exit 0
fi
if [ "$1" = plugin ] && [ "$2" = marketplace ] && [ "$3" = list ]; then
  if [ -f "$HOME/.ponytail-marketplace-claude" ]; then
    if [ "${AGENTMESH_FAKE_MIXED_MARKETPLACE:-0}" = 1 ]; then
      printf "%s\n" "  ❯ unrelated" "    Source: GitHub (DietrichGebert/ponytail-extra)" "  ❯ ponytail" "    Source: GitHub (untrusted/ponytail)"
    elif [ "${AGENTMESH_FAKE_WRONG_MARKETPLACE:-0}" = 1 ]; then
      printf "%s\n" "  ❯ ponytail" "    Source: GitHub (untrusted/ponytail)"
    else
      printf "%s\n" "  ❯ ponytail" "    Source: GitHub (DietrichGebert/ponytail)"
    fi
  fi
  exit 0
fi
if [ "$1" = plugin ] && [ "$2" = marketplace ] && [ "$3" = add ]; then
  [ "${AGENTMESH_FAKE_MARKETPLACE_FAIL:-0}" = 1 ] && exit 1
  : > "$HOME/.ponytail-marketplace-claude"
fi
printf "%s\n" "$*" >> "$HOME/claude-plugin.log"
if [ "$1" = plugin ] && [ "$2" = install ] && [ "$3" = ponytail@ponytail ]; then
  : > "$HOME/.ponytail-claude"
fi
EOF
    cat > /tmp/fake-bin/copilot <<'"'"'EOF'"'"'
#!/bin/sh
if [ "$1" = plugin ] && [ "$2" = list ]; then
  printf "%s\n" "Installed plugins:"
  [ -f "$HOME/.ponytail-copilot" ] && printf "%s\n" "  ponytail@ponytail (v4.8.4)"
  exit 0
fi
if [ "$1" = plugin ] && [ "$2" = marketplace ] && [ "$3" = list ]; then
  if [ -f "$HOME/.ponytail-marketplace-copilot" ]; then
    if [ "${AGENTMESH_FAKE_MIXED_MARKETPLACE:-0}" = 1 ]; then
      printf "%s\n" "  • unrelated (GitHub: DietrichGebert/ponytail-extra)" "  • ponytail (GitHub: untrusted/ponytail)"
    elif [ "${AGENTMESH_FAKE_WRONG_MARKETPLACE:-0}" = 1 ]; then
      printf "%s\n" "  • ponytail (GitHub: untrusted/ponytail)"
    else
      printf "%s\n" "  • ponytail (GitHub: DietrichGebert/ponytail)"
    fi
  fi
  exit 0
fi
if [ "$1" = plugin ] && [ "$2" = marketplace ] && [ "$3" = add ]; then
  [ "${AGENTMESH_FAKE_MARKETPLACE_FAIL:-0}" = 1 ] && exit 1
  : > "$HOME/.ponytail-marketplace-copilot"
fi
printf "%s\n" "$*" >> "$HOME/copilot-plugin.log"
if [ "$1" = plugin ] && [ "$2" = install ] && [ "$3" = ponytail@ponytail ]; then
  : > "$HOME/.ponytail-copilot"
fi
EOF
    chmod +x /tmp/fake-bin/claude /tmp/fake-bin/copilot
    export HOME=/tmp/agentmesh-home
    export PATH="/tmp/fake-bin:$PATH"
    npm run check
    bash setup/install.sh --check
    test ! -e "$HOME/.ponytail-claude"
    test ! -e "$HOME/.ponytail-copilot"
    test ! -e "$HOME/.copilot/instructions/agentmesh.instructions.md"
    bash setup/install.sh | tee "$HOME/agentmesh-install.log"
    test -f "$HOME/.ponytail-claude"
    test -f "$HOME/.ponytail-copilot"
    test -f "$HOME/.copilot/instructions/agentmesh.instructions.md"
    grep -Fx "applyTo: \"**\"" "$HOME/.copilot/instructions/agentmesh.instructions.md"
    grep -Fx "plugin marketplace add DietrichGebert/ponytail --scope user" "$HOME/claude-plugin.log"
    grep -Fx "plugin install ponytail@ponytail --scope user" "$HOME/claude-plugin.log"
    grep -Fx "plugin marketplace add DietrichGebert/ponytail" "$HOME/copilot-plugin.log"
    grep -Fx "plugin install ponytail@ponytail" "$HOME/copilot-plugin.log"
    grep -F "Ponytail plugin (claude)" "$HOME/agentmesh-install.log"
    grep -F "Ponytail plugin (copilot)" "$HOME/agentmesh-install.log"
    grep -F "VS Code global instructions installed" "$HOME/agentmesh-install.log"
    mkdir -p /tmp/agentmesh-rejected-home
    : > /tmp/agentmesh-rejected-home/.ponytail-marketplace-claude
    if HOME=/tmp/agentmesh-rejected-home AGENTMESH_FAKE_MARKETPLACE_FAIL=1 AGENTMESH_FAKE_MIXED_MARKETPLACE=1 bash setup/install.sh >/tmp/agentmesh-rejected.log 2>&1; then
      echo "untrusted Ponytail marketplace was accepted" >&2
      exit 1
    fi
    grep -F "Could not register the trusted Ponytail marketplace for claude." /tmp/agentmesh-rejected.log
    test ! -e /tmp/agentmesh-rejected-home/.ponytail-claude
  '
