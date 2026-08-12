#!/usr/bin/env bash
# agentmesh installer — installs the globally available tools this plugin
# orchestrates (engram, ax, codegraph, serena, rtk), its required Ponytail
# companion plugin on native plugin hosts, then agentmesh itself.
# Adapted from the proven install-stack-share.sh pattern (OS + editor
# detection, per-tool install, graceful skip when a combo isn't supported),
# updated for agentmesh: mesh modes + RTK + the 4 MCP registrations now come from
# ONE plugin install instead of 5 separate ones, and serena (missing from
# the original script) is added.
#
# Run with --check to only report what's present, install nothing (the
# previous behavior of this file, still useful for a fast status read).
set -uo pipefail

ok(){ printf '  ✅ %s\n' "$1"; }
add(){ printf '  📦 %s\n' "$1"; }
skip(){ printf '  ⏭️  %s (%s)\n' "$1" "$2"; }
have(){ command -v "$1" >/dev/null 2>&1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
export PATH="$HOME/.local/bin:$PATH"
CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

if ! have node; then
  echo "❌ Node.js is required to install Agentmesh. Install Node.js 18+ and re-run."
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)'; then
  echo "❌ Node.js 18+ is required to install Agentmesh."
  exit 1
fi

echo "══ agentmesh installer ══"
[ "$CHECK_ONLY" -eq 1 ] && echo "(--check: reporting only, installing nothing)"

# ---- detect OS ----
case "$(uname -s 2>/dev/null || echo unknown)" in
  Darwin) OS=mac ;;
  Linux)  OS=linux ;;
  MINGW*|MSYS*|CYGWIN*) OS=windows-bash ;;
  *) OS=unknown ;;
esac
if [ "$OS" = unknown ] && have powershell.exe; then OS=windows-native; fi
echo "OS detected: $OS"
[ "$OS" = windows-native ] && { echo "❌ Needs Git Bash or WSL to run this script. Install Git Bash: https://git-scm.com/downloads"; exit 1; }

# ---- detect supported hosts present ----
EDITORS=()
have claude && EDITORS+=(claude)
have copilot && EDITORS+=(copilot)

if have code || { [ "$OS" = mac ] && { [ -d "/Applications/Visual Studio Code.app" ] || [ -d "$HOME/Applications/Visual Studio Code.app" ]; }; }; then
  EDITORS+=(vscode)
fi

if [ ${#EDITORS[@]} -eq 0 ]; then
  echo "❌ No supported editor detected (Claude Code, Copilot CLI, or VS Code)."
  echo "   Install one, e.g.: npm install -g @anthropic-ai/claude-code"
  echo "   Then re-run: bash setup/install.sh"
  exit 1
fi
echo "Hosts detected: ${EDITORS[*]}"

verify_stack(){
  node "$ROOT/setup/check-stack.js" || {
    echo "  ⚠️  Stack differs from stack.lock.json; missing tools are installed below, but existing newer versions are not downgraded."
  }
}

install_pkg(){ # $1 = brew formula/tap
  case "$OS" in
    mac|linux) have brew || { echo "❌ missing Homebrew (https://brew.sh)"; return 1; }; brew install "$1" ;;
    windows-bash) echo "  ⚠️  Windows: install '$1' manually (winget/scoop) or use WSL for brew." ;;
  esac
}

plugin_is_installed(){ # $1 = host command
  "$1" plugin list 2>/dev/null | grep -Fq "$PONYTAIL_PLUGIN"
}

ponytail_marketplace_is_trusted(){ # $1 = host command
  case "$1" in
    claude)
      claude plugin marketplace list 2>/dev/null | awk -v source="$PONYTAIL_SOURCE" '
        {
          raw = $0
          sub(/^[[:space:]]+/, "", raw)
          entry = raw
          sub(/^[^[:space:]]+[[:space:]]+/, "", entry)
          if (entry == "ponytail") {
            ponytail = 1
            next
          }
          if (ponytail && raw == "Source: GitHub (" source ")") {
            trusted = 1
            exit
          }
          if (ponytail && raw != "") ponytail = 0
        }
        END { exit trusted ? 0 : 1 }
      '
      ;;
    copilot)
      copilot plugin marketplace list 2>/dev/null | awk -v source="$PONYTAIL_SOURCE" '
        {
          entry = $0
          sub(/^[[:space:]]+/, "", entry)
          sub(/^[^[:space:]]+[[:space:]]+/, "", entry)
          if (entry == "ponytail (GitHub: " source ")") trusted = 1
        }
        END { exit trusted ? 0 : 1 }
      '
      ;;
  esac
}

register_ponytail_marketplace(){ # $1 = claude|copilot
  local host="$1"
  case "$host" in
    claude) claude plugin marketplace add "$PONYTAIL_SOURCE" --scope user ;;
    copilot) copilot plugin marketplace add "$PONYTAIL_SOURCE" ;;
  esac || {
    echo "❌ Could not register the trusted Ponytail marketplace for $host."
    return 1
  }

  if ! ponytail_marketplace_is_trusted "$host"; then
    echo "❌ Could not verify the trusted Ponytail marketplace for $host."
    return 1
  fi
}

install_ponytail_for_host(){ # $1 = claude|copilot
  local host="$1"
  if ! ponytail_marketplace_is_trusted "$host"; then
    if [ "$CHECK_ONLY" -eq 1 ]; then
      skip "Ponytail marketplace ($host)" "trusted source $PONYTAIL_SOURCE is not registered"
      return 0
    fi
    register_ponytail_marketplace "$host" || return 1
  fi

  if plugin_is_installed "$host"; then
    ok "Ponytail already installed for $host"
    return 0
  fi
  if [ "$CHECK_ONLY" -eq 1 ]; then
    skip "Ponytail ($host)" "missing required plugin $PONYTAIL_PLUGIN (tested $PONYTAIL_VERSION)"
    return 0
  fi

  add "Ponytail for $host"
  case "$host" in
    claude)
      if ! claude plugin install "$PONYTAIL_PLUGIN" --scope user; then
        echo "❌ Could not install required Ponytail plugin for Claude Code."
        return 1
      fi
      ;;
    copilot)
      if ! copilot plugin install "$PONYTAIL_PLUGIN"; then
        echo "❌ Could not install required Ponytail plugin for Copilot CLI."
        return 1
      fi
      ;;
  esac

  if ! plugin_is_installed "$host"; then
    echo "❌ Ponytail installation for $host did not appear in the installed plugin list."
    return 1
  fi
  ok "Ponytail installed for $host"
}

summarize_ponytail(){
  local host
  for host in "${EDITORS[@]}"; do
    case "$host" in
      claude|copilot)
        plugin_is_installed "$host" \
          && ok "Ponytail plugin ($host)" \
          || skip "Ponytail plugin ($host)" "not installed"
        ;;
    esac
  done
}

# ---- arch detection (for direct-binary Linux fallbacks when brew isn't there) ----
case "$(uname -m 2>/dev/null)" in
  x86_64|amd64) ARCH=amd64 ;;
  arm64|aarch64) ARCH=arm64 ;;
  *) ARCH=unknown ;;
esac

# Downloads a linux tarball with a single binary at its root and installs it
# to ~/.local/bin -- the cross-platform fallback for tools this script would
# otherwise only know how to install via Homebrew.
install_linux_binary(){ # $1 = display name, $2 = URL, $3 = archive name, $4 = binary, $5 = expected SHA-256
  local name="$1" url="$2" asset="$3" bin="$4" expected="$5"
  [ "$ARCH" = unknown ] && { skip "$name" "unsupported CPU architecture"; return 1; }
  [ -z "$url" ] && { skip "$name" "couldn't resolve a Linux release asset for arch $ARCH"; return 1; }
  mkdir -p "$HOME/.local/bin" || { skip "$name" "could not create $HOME/.local/bin"; return 1; }
  if [ -e "$HOME/.local/bin/$bin" ] || [ -L "$HOME/.local/bin/$bin" ]; then
    skip "$name" "existing $HOME/.local/bin/$bin is not on PATH; refusing to overwrite it"
    return 1
  fi
  local tmp; tmp="$(mktemp -d)"
  curl -fsSL "$url" -o "$tmp/$asset" 2>/dev/null || { skip "$name" "download failed: $url"; rm -rf "$tmp"; return 1; }
  local actual
  if [ -z "$expected" ]; then
    skip "$name" "no pinned checksum for $asset"
    rm -rf "$tmp"
    return 1
  fi
  if have sha256sum; then
    actual="$(sha256sum "$tmp/$asset" | awk '{print $1}')"
  elif have shasum; then
    actual="$(shasum -a 256 "$tmp/$asset" | awk '{print $1}')"
  else
    skip "$name" "sha256 verifier unavailable"
    rm -rf "$tmp"
    return 1
  fi
  if [ "$actual" != "$expected" ]; then
    skip "$name" "checksum mismatch"
    rm -rf "$tmp"
    return 1
  fi
  if tar -tzf "$tmp/$asset" 2>/dev/null | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
    skip "$name" "refusing archive with unsafe paths"
    rm -rf "$tmp"
    return 1
  fi
  if tar -tvzf "$tmp/$asset" 2>/dev/null | awk '{
    type = substr($0, 1, 1);
    if (type != "-" && type != "d") exit 1;
  }'; then :; else
    skip "$name" "refusing archive with links or special files"
    rm -rf "$tmp"
    return 1
  fi
  tar -xzf "$tmp/$asset" -C "$tmp" 2>/dev/null || { skip "$name" "extract failed"; rm -rf "$tmp"; return 1; }
  [ -f "$tmp/$bin" ] && [ ! -L "$tmp/$bin" ] || { skip "$name" "binary '$bin' not found as a regular file at archive root"; rm -rf "$tmp"; return 1; }
  mv "$tmp/$bin" "$HOME/.local/bin/$bin" \
    || { skip "$name" "could not install binary"; rm -rf "$tmp"; return 1; }
  chmod +x "$HOME/.local/bin/$bin" \
    || { skip "$name" "could not mark binary executable"; rm -rf "$tmp"; return 1; }
  rm -rf "$tmp"
  export PATH="$HOME/.local/bin:$PATH"
  ok "installed to ~/.local/bin/$bin"
}

ENGRAM_VERSION="$(node -p "require('$ROOT/stack.lock.json').tools.engram.version")"
CODEGRAPH_VERSION="$(node -p "require('$ROOT/stack.lock.json').tools.codegraph.version")"
SERENA_VERSION="$(node -p "require('$ROOT/stack.lock.json').tools.serena.version")"
RTK_VERSION="$(node -p "require('$ROOT/stack.lock.json').tools.rtk.version")"
PONYTAIL_VERSION="$(node -p "require('$ROOT/stack.lock.json').tools.ponytail.version")"
PONYTAIL_SOURCE="$(node -p "require('$ROOT/stack.lock.json').tools.ponytail.source")"
PONYTAIL_PLUGIN="$(node -p "require('$ROOT/stack.lock.json').tools.ponytail.plugin")"

# ---- install the 5 globally available binaries ----
echo; echo "── engram (persistent local memory) ──"
if have engram; then ok "already installed"
elif [ "$CHECK_ONLY" -eq 1 ]; then skip "engram" "brew install gentleman-programming/tap/engram (or a Linux binary from its GitHub releases)"
elif [ "$OS" = mac ]; then add "engram"; install_pkg gentleman-programming/tap/engram
elif [ "$OS" = linux ] && have brew; then add "engram"; install_pkg gentleman-programming/tap/engram
elif [ "$OS" = linux ]; then
  add "engram"
  ENGRAM_ASSET="engram_${ENGRAM_VERSION}_linux_${ARCH}.tar.gz"
  install_linux_binary engram \
    "https://github.com/Gentleman-Programming/engram/releases/download/v${ENGRAM_VERSION}/${ENGRAM_ASSET}" \
    "$ENGRAM_ASSET" engram \
    "$(node -p "require('$ROOT/stack.lock.json').tools.engram.checksums['$ENGRAM_ASSET'] || ''")"
else skip "engram" "brew install gentleman-programming/tap/engram, or see https://github.com/Gentleman-Programming/engram/releases"
fi

echo; echo "── rtk (command output compression, 60-90%) ──"
if have rtk; then ok "already installed"
elif [ "$CHECK_ONLY" -eq 1 ]; then skip "rtk" "brew install rtk (or a Linux binary from its GitHub releases)"
elif [ "$OS" = mac ]; then add "rtk"; install_pkg rtk
elif [ "$OS" = linux ] && have brew; then add "rtk"; install_pkg rtk
elif [ "$OS" = linux ]; then
  add "rtk"
  variant="unknown-linux-musl"; [ "$ARCH" = arm64 ] && variant="unknown-linux-gnu"
  arch_name="x86_64"; [ "$ARCH" = arm64 ] && arch_name="aarch64"
  RTK_ASSET="rtk-${arch_name}-${variant}.tar.gz"
  install_linux_binary rtk \
    "https://github.com/rtk-ai/rtk/releases/download/v${RTK_VERSION}/${RTK_ASSET}" \
    "$RTK_ASSET" rtk \
    "$(node -p "require('$ROOT/stack.lock.json').tools.rtk.checksums['$RTK_ASSET'] || ''")"
else skip "rtk" "https://github.com/rtk-ai/rtk/releases/latest"
fi

echo; echo "── codegraph (structural code graph) ──"
if have codegraph; then ok "already installed"
elif [ "$CHECK_ONLY" -eq 1 ]; then skip "codegraph" "npm install -g @colbymchenry/codegraph"
else add "codegraph"; have npm && npm install -g "@colbymchenry/codegraph@${CODEGRAPH_VERSION}" >/dev/null 2>&1 && ok "installed via npm" || skip "codegraph" "missing npm/node or pinned package unavailable"; fi

echo; echo "── serena (LSP symbol navigation/editing) ──"
if have serena; then ok "already installed"
elif [ "$CHECK_ONLY" -eq 1 ]; then skip "serena" "uv tool install -p 3.13 serena-agent (needs https://astral.sh/uv)"
else
  add "serena"
  if ! have uv; then
    if [ "${AGENTMESH_ALLOW_REMOTE_INSTALL:-0}" = "1" ]; then
      uv_tmp="$(mktemp)"
      curl -fsSL https://astral.sh/uv/install.sh -o "$uv_tmp" 2>/dev/null \
        && sh "$uv_tmp" >/dev/null 2>&1
      rm -f "$uv_tmp"
    else
      skip "uv" "not installed; install uv or set AGENTMESH_ALLOW_REMOTE_INSTALL=1"
    fi
    export PATH="$HOME/.local/bin:$PATH"
  fi
  if have uv; then uv tool install -p 3.13 "serena-agent==${SERENA_VERSION}" >/dev/null 2>&1 && ok "installed via uv" || skip "serena" "pinned uv install failed, see https://github.com/oraios/serena"
  else skip "serena" "uv install failed, see https://astral.sh/uv"
  fi
fi

echo; echo "── ax (session evidence graph / skill triage) ──"
if [ "$OS" = mac ]; then
  if have ax; then ok "already installed"
  elif [ "$CHECK_ONLY" -eq 1 ]; then skip "ax" "see https://github.com/Necmttn/ax#install"
  else
    add "ax"; have bun || install_pkg oven-sh/bun/bun
    have surreal || install_pkg surrealdb/tap/surreal
    if [ "${AGENTMESH_ALLOW_REMOTE_INSTALL:-0}" = "1" ]; then
      ax_tmp="$(mktemp)"
      curl -fsSL https://ax.necmttn.com/install -o "$ax_tmp" 2>/dev/null \
        && sh "$ax_tmp"
      rm -f "$ax_tmp"
      export PATH="$HOME/.local/bin:$PATH"
      have ax && ax setup >/dev/null 2>&1
    else
      skip "ax" "remote installer disabled; set AGENTMESH_ALLOW_REMOTE_INSTALL=1"
    fi
  fi
else
  skip "ax" "macOS-only release (darwin-arm64), no Windows/Linux build yet"
fi

CODEGRAPH_MARKER="${XDG_CONFIG_HOME:-$HOME/.config}/agentmesh/codegraph-global"
configure_codegraph_scope(){
  if ! have codegraph; then
    skip "CodeGraph all-repo indexing" "CodeGraph is not installed"
  elif [ -f "$CODEGRAPH_MARKER" ]; then
    ok "CodeGraph all-repo indexing already enabled"
  elif [ "$CHECK_ONLY" -eq 1 ]; then
    skip "CodeGraph all-repo indexing" "not enabled (opt-in; creates .codegraph/ per repository)"
  elif [ "${AGENTMESH_CODEGRAPH_GLOBAL:-}" = "1" ]; then
    mkdir -p "$(dirname "$CODEGRAPH_MARKER")"
    : > "$CODEGRAPH_MARKER"
    ok "CodeGraph all-repo indexing enabled by AGENTMESH_CODEGRAPH_GLOBAL=1"
  elif [ -t 0 ]; then
    printf 'Enable full CodeGraph indexing for every repository you open? [y/N] '
    answer=''
    IFS= read -r answer || answer=''
    case "$answer" in
      y|Y|yes|YES)
        mkdir -p "$(dirname "$CODEGRAPH_MARKER")"
        : > "$CODEGRAPH_MARKER"
        ok "CodeGraph all-repo indexing enabled"
        ;;
      *) skip "CodeGraph all-repo indexing" "left disabled";;
    esac
  else
    skip "CodeGraph all-repo indexing" "non-interactive install; set AGENTMESH_CODEGRAPH_GLOBAL=1 to enable"
  fi
}

configure_vscode_instructions(){
  if ! printf '%s\n' "${EDITORS[@]}" | grep -qx vscode; then
    return 0
  fi

  echo; echo "── VS Code instructions (global Mesh policy) ──"
  if [ "$CHECK_ONLY" -eq 1 ]; then
    node "$ROOT/setup/install-vscode-instructions.js" --check \
      || skip "VS Code instructions" "unmanaged Agentmesh instruction file"
    return 0
  fi

  node "$ROOT/setup/install-vscode-instructions.js" \
    && ok "VS Code global instructions installed" \
    || { echo "❌ Could not install VS Code global instructions."; return 1; }
}

echo; echo "── CodeGraph scope ──"
configure_codegraph_scope

configure_vscode_instructions || exit 1

echo; echo "── Ponytail (required minimal-code policy) ──"
PONYTAIL_HOSTS=()
for ed in "${EDITORS[@]}"; do
  case "$ed" in
    claude|copilot) PONYTAIL_HOSTS+=("$ed");;
  esac
done
if [ ${#PONYTAIL_HOSTS[@]} -eq 0 ]; then
  skip "Ponytail plugin" "VS Code uses Agentmesh global instructions; native Ponytail plugins require Claude Code or Copilot CLI"
else
  for host in "${PONYTAIL_HOSTS[@]}"; do
    install_ponytail_for_host "$host" || exit 1
  done
fi

echo; echo "── stack compatibility ──"
verify_stack

[ "$CHECK_ONLY" -eq 1 ] && {
  echo
  echo "── summary ──"
  for c in engram rtk codegraph serena ax; do have "$c" && ok "$c present" || skip "$c" "not installed"; done
  summarize_ponytail
  exit 0
}

# ---- install agentmesh itself (mesh modes + RTK hook + MCP orchestration) ----
echo; echo "── agentmesh (mesh modes + RTK hook + CodeGraph/AX/Engram/Serena orchestration) ──"
for ed in "${EDITORS[@]}"; do
  case "$ed" in
    claude)
      claude plugin marketplace add "$ROOT" >/dev/null 2>&1
      claude plugin install agentmesh@agentmesh >/dev/null 2>&1 && ok "claude" || skip "claude" "install failed, run manually: claude plugin install agentmesh@agentmesh"
      ;;
    copilot)
      copilot plugin marketplace add "$ROOT" >/dev/null 2>&1
      copilot plugin install agentmesh@agentmesh >/dev/null 2>&1 && ok "copilot CLI" || skip "copilot CLI" "install failed, try: copilot --plugin-dir $ROOT"
      ;;
    vscode)
      skip "vscode plugin" "VS Code uses global instructions plus MCP registration"
      ;;
  esac
done

# ---- register the 4 MCP servers immediately (don't make the user wait for the self-healing hook) ----
echo; echo "── registering MCP servers (CodeGraph/AX/Engram/Serena) ──"
for ed in "${EDITORS[@]}"; do
  node "$ROOT/setup/register-mcp.js" --client="$ed" >/dev/null 2>&1 \
    && ok "$ed" \
    || skip "$ed" "run manually: node $ROOT/setup/register-mcp.js --client=$ed"
done

# ---- statusline (token-savings badge, Claude Code only) ----
echo; echo "── statusline (💾 saved Xtk badge, Claude Code only) ──"
if have rtk && printf '%s\n' "${EDITORS[@]:-}" | grep -qx claude; then
 mkdir -p "$CLAUDE_DIR"
 if ! cp "$ROOT/assets/agentmesh-statusline.sh" "$CLAUDE_DIR/agentmesh-statusline.sh" 2>/dev/null \
   || ! chmod +x "$CLAUDE_DIR/agentmesh-statusline.sh" 2>/dev/null; then
   skip "statusline" "could not install $CLAUDE_DIR/agentmesh-statusline.sh"
   echo
   echo "── summary ──"
   for c in engram rtk codegraph serena ax; do have "$c" && ok "$c present" || skip "$c" "not installed on this OS"; done
   summarize_ponytail
   echo
   echo "🔁 Restart your editor to activate everything. Then run /mesh-status to verify."
   exit 0
 fi
 SETTINGS="$CLAUDE_DIR/settings.json"
 if [ -f "$SETTINGS" ] && grep -q '"statusLine"' "$SETTINGS" 2>/dev/null; then
   skip "statusline" "already configured in settings.json — add manually if desired: $CLAUDE_DIR/agentmesh-statusline.sh"
 else
   [ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
   node "$ROOT/setup/update-statusline.js" "$SETTINGS" "$CLAUDE_DIR/agentmesh-statusline.sh" \
     && ok "statusline installed" || skip "statusline" "edit settings.json by hand"
 fi
else
  skip "statusline" "needs rtk + Claude Code"
fi

echo
echo "── summary ──"
for c in engram rtk codegraph serena ax; do have "$c" && ok "$c present" || skip "$c" "not installed on this OS"; done
summarize_ponytail
echo
echo "🔁 Restart your editor to activate everything. Then run /mesh-status to verify."
