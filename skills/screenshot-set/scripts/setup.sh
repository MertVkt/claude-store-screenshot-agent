#!/usr/bin/env bash
# setup.sh : installs dependencies for preview and export. Run once; running it again is harmless.
#   bash setup.sh            # into ~/.cache/store-screenshots (works in any writable environment)
#   SS_DEPS=/path bash setup.sh
# Installs: playwright + chromium (preview), style-dictionary (token export), Pillow (export/verification).
set -uo pipefail
DEPS="${SS_DEPS:-$HOME/.cache/store-screenshots}"
mkdir -p "$DEPS" && cd "$DEPS"
command -v node >/dev/null || { echo "ERROR: node not found (Node 18+ required)"; exit 1; }
[ -f package.json ] || echo '{"name":"store-screenshots-deps","private":true}' > package.json
npm install --no-fund --no-audit --silent playwright@1.56.0 style-dictionary@5.6.0 && echo "OK  npm packages -> $DEPS"
if [ -z "${PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:-}" ]; then
  npx --yes playwright install chromium >/dev/null 2>&1 && echo "OK  chromium" || echo "WARN chromium did not download: preview will not work, check in Figma instead"
fi
python3 -c "import PIL" 2>/dev/null && echo "OK  Pillow" || {
  python3 -m pip install --user --quiet pillow 2>/dev/null || python3 -m pip install --user --quiet --break-system-packages pillow
  python3 -c "import PIL" 2>/dev/null && echo "OK  Pillow" || echo "WARN Pillow could not be installed: export/verification will not work"; }
