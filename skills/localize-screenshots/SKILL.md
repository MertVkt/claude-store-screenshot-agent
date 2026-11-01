---
name: localize-screenshots
description: 'Translates a screenshot set already built in Figma into other languages: clones the row the designer edited in Figma, swaps texts and language-specific screens, shrinks text that does not fit, and reports. Use when the user asks to "localize", "translate", "adapt the screenshots to German/Turkish/...", "add a new language", or "roll out the store screenshots to other languages".'
---

# Screenshot localization

The scripts are in [screenshot-set](../screenshot-set/SKILL.md): `SS=SKILL_DIR/../screenshot-set/scripts`. First
apply the **Environment** and **Rules** sections of screenshot-set. Full guide:
[05-localization](../screenshot-set/reference/05-localization.md).

If an app name was given and it is not clear which set is meant, check the registry first (`app_lookup.py find`);
if needed, run [find-app](../find-app/SKILL.md).

## Flow

1. **Sync the base language from Figma.** The designer may have changed the texts:
   `node $SS/figma_js.mjs read spec.json --locale en-US` → `use_figma` → save the result as
   `Work/figma/read_en-US.result.json` → update the base-language texts in the spec. List the changes to the user.
2. **Translate.** Ask for the target languages (as App Store Connect codes: `tr`, `de-DE`, `fr-FR`, `pt-BR` ...).
   Translate the meaning, not the words; keep the length close to the source; move the emphasis to the
   corresponding word; adapt number formats to the language. Show the translations as a table (image, layer,
   source, translation). Once the user approves, write them into the spec.
3. **Language-specific screens**, if any, must be under `Asset/screens/<locale>/`; if missing, ask for them or get
   approval to continue with the base-language screen.
4. **Length check** (if the preview works): `node $SS/render.mjs spec.json --locales tr,de-DE --scale 0.5`.
5. **Figma:**
   ```bash
   node $SS/figma_js.mjs localize spec.json --from en-US --to tr,de-DE
   node $SS/figma_js.mjs build spec.json --locales en-US
   node $SS/figma_dryrun.mjs Work/figma/build_en-US.js --state Work/figma/_dry.json
   node $SS/figma_dryrun.mjs Work/figma/localize_tr.js --state Work/figma/_dry.json
   ```
   Run each language's `localize_<locale>.js` with `use_figma` (languages can run in parallel) and save the result.
   If `EXISTS` comes back, stop and ask.
6. **Report:** in the result's `texts` list, `shrunk` is informational; for `ERROR: does not fit, shorten the text`,
   shorten that text and propose it again. For language-specific screens, `upload_assets` +
   `figma_upload.py` (the fallback is in screenshot-set).
7. Show one frame's `get_screenshot` per language.

Right-to-left languages (Arabic, Hebrew) are not supported automatically; they need a separate set, say so up
front.
