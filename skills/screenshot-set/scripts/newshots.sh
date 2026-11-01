#!/usr/bin/env bash
# newshots.sh : opens a new App Store screenshot set.
#
#   newshots "Lumen" LMN              # next free number: LMNSS01, LMNSS02 ...
#   newshots "Lumen" LMN 03           # give the number by hand
#   SEED="#FF5A36" newshots "Lumen" LMN      # if there is no brand (_brand/LMN.tokens.json), builds one from a seed color
#
# Creates: ~/Desktop/Projects/<App>/<CODE>SS<nn>/  folder layout + spec.json + credit log
set -euo pipefail

ROOT="${SS_ROOT:-$HOME/Desktop/Projects}"
SKILL="${SS_SKILL:-$HOME/.claude/skills/app-store-screenshots}"
APP="${1:-}"; CODE="${2:-}"; NUM="${3:-}"
[[ -z "$APP" || -z "$CODE" ]] && { echo 'Usage: newshots "<App Name>" <CODE> [nn]'; exit 1; }
CODE=$(echo "$CODE" | tr '[:lower:]' '[:upper:]')

APPDIR="$ROOT/$APP"; mkdir -p "$APPDIR"
if [[ -z "$NUM" ]]; then
  n=1; while [[ -e "$APPDIR/${CODE}SS$(printf %02d $n)" ]]; do n=$((n+1)); done; NUM=$(printf %02d $n)
fi
SET="SS$NUM"; DEST="$APPDIR/${CODE}${SET}"
[[ -e "$DEST" ]] && { echo "Already exists: $DEST"; exit 1; }

mkdir -p "$DEST"/{Brief,Ref.Shots,Asset/screens/en-US,Asset/bg,Asset/objects,Asset/fonts,Work/preview,Work/figma,Work/export_raw,Final,Logs}
# brand: <App>/_brand/<CODE>.tokens.json (built with --seed if missing)
BRAND="$APPDIR/_brand/$CODE.tokens.json"
if [[ ! -f "$BRAND" ]]; then
  if [[ -n "${SEED:-}" ]]; then node "$SKILL/scripts/tokens.mjs" init --code "$CODE" --app "$APP" --seed "$SEED" -o "$BRAND"
  else echo "No brand file: $BRAND"; echo "First: SEED='#RRGGBB' newshots \"$APP\" $CODE   (or tokens.mjs init)"; rm -rf "$DEST"; exit 1; fi
fi
python3 - "$SKILL/assets/spec.example.json" "$DEST/spec.json" "$APP" "$CODE" "$SET" <<'PY'
import json, sys
src, dst, app, code, s = sys.argv[1:]
spec = json.load(open(src))
spec.update(app=app, code=code, set=s, locales=["en-US"], baseLocale="en-US", brand=f"../_brand/{code}.tokens.json")
json.dump(spec, open(dst, "w"), ensure_ascii=False, indent=2)
PY
[[ -f "$HOME/.config/store-screenshot-agent/.env" ]] && ln -sf "$HOME/.config/store-screenshot-agent/.env" "$DEST/.env"
printf 'date,service,type,model,credits,note\n' > "$DEST/Logs/credits.csv"
printf '.env\n.env.*\nAPI_Keys/\n*.rtf\nWork/\n' > "$DEST/.gitignore"

cat > "$DEST/Brief/README.md" <<EOF
# $APP ${CODE}${SET} : Brief

## Goal
<new set, PPO test (which hypothesis), or Custom Product Page>

## Locales
<en-US, tr, de-DE ...>

## Message order (the first 3 images show in search)
1. <strongest promise>
2. <...>
3. <...>

## Real screens
Under Asset/screens/<locale>/, from the simulator or from the team (sim_capture.sh).

## Figma file
<figma.com/design/... link>
EOF

cat > "$DEST/PRODUCTION.md" <<EOF
# ${CODE}${SET} production notes
- opened: $(date +%Y-%m-%d)
- Figma: <link>
- decisions / measurements / credits:
EOF

cat <<EOF
Ready: $DEST

  spec.json        the single source to edit (comes with 3 example images)
  Asset/screens/   real app screens, in locale folders
  Ref.Shots/       competitor/inspiration images (store_refs.py)
  Work/            preview, Figma JS, raw export files (not delivered)
  Final/           delivery PNGs (figma_export.py)
EOF
