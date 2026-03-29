#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BIN_DIR="${HOME}/.codexy/bin"
TARGET="${BIN_DIR}/codexy"

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' "Node.js 20+ is required before Codexy can complete setup." >&2
  exit 1
fi

node "$SCRIPT_DIR/scripts/install.mjs"

mkdir -p "$BIN_DIR"

cat > "$TARGET" <<EOF
#!/usr/bin/env sh
set -eu

CODEXY_INSTALL_DIR='$SCRIPT_DIR'

if [ ! -f "\$CODEXY_INSTALL_DIR/scripts/codexy.mjs" ]; then
  printf '%s\n' "Codexy install directory not found: \$CODEXY_INSTALL_DIR" "Rerun install.sh from the current Codexy checkout." >&2
  exit 1
fi

exec node "\$CODEXY_INSTALL_DIR/scripts/codexy.mjs" "\$@"
EOF

chmod +x "$TARGET"

PROFILE_FILE=""
for candidate in "$HOME/.zprofile" "$HOME/.bash_profile" "$HOME/.profile"; do
  if [ -f "$candidate" ]; then
    PROFILE_FILE="$candidate"
    break
  fi
done

if [ -z "$PROFILE_FILE" ]; then
  PROFILE_FILE="$HOME/.profile"
fi

PATH_LINE='export PATH="$HOME/.codexy/bin:$PATH"'
if [ "${CODEXY_SKIP_PATH_UPDATE:-0}" != "1" ]; then
  if [ ! -f "$PROFILE_FILE" ] || ! grep -F "$PATH_LINE" "$PROFILE_FILE" >/dev/null 2>&1; then
    printf '\n%s\n' "$PATH_LINE" >> "$PROFILE_FILE"
  fi
fi

case ":${PATH:-}:" in
  *":$BIN_DIR:"*) : ;;
  *) export PATH="$BIN_DIR:$PATH" ;;
esac

if [ "${CODEXY_SKIP_PATH_UPDATE:-0}" = "1" ]; then
  printf '%s\n' "Installed Codexy launcher at $TARGET." "Skipped persistent PATH update because CODEXY_SKIP_PATH_UPDATE=1." "Next steps:" "  codexy help" "  codexy doctor"
else
  printf '%s\n' "Installed Codexy launcher at $TARGET." "Updated PATH configuration in $PROFILE_FILE." "Next steps:" "  codexy help" "  codexy doctor"
fi
