# 05 · Copy and localization

## Copy (base language)

- **One promise per image.** Not the feature name but the user's gain: not "AI Enhance" but "Fix any photo in one
  tap".
- **At most 2 lines, 3-6 words.** It appears small in search results. A subtitle (`sub`) is optional, one sentence.
- **The first 3 images tell the story on their own.** Most people only see these in search. 1: main promise,
  2: how/proof, 3: strongest feature or social proof. The rest are detail.
- **Emphasis is a single word or short phrase** (`*any*`). It does not have to be in every headline; follow the
  rhythm of the series.
- **No unverifiable claims.** "#1", "best", ratings and download counts only with real data; the source goes in
  `PRODUCTION.md`.
- If the user has an ASO keyword list, prefer keywords that fit naturally in the headlines; do not force them.

## Language codes

App Store Connect codes are used; folder and row names are these. The language in the file name is the short code.

| Language | Code | In file name | Note |
|---|---|---|---|
| English (US) | `en-US` | `EN` | base language |
| Turkish | `tr` | `TR` | decimal comma (4,8), "B" thousand, "Mn" million |
| German | `de-DE` | `DE` | text gets longer; decimal comma |
| French | `fr-FR` | `FR` | decimal comma, space before `:` and `!` |
| Spanish | `es-ES` / `es-MX` | `ES` / `ES-MX` | |
| Portuguese (Brazil) | `pt-BR` | `PT-BR` | |
| Italian | `it` | `IT` | |
| Japanese | `ja` | `JA` | needs a CJK font (`byLocale`) |
| Korean | `ko` | `KO` | needs a CJK font |
| Chinese (Simplified) | `zh-Hans` | `ZH-HANS` | needs a CJK font |
| Arabic, Hebrew | `ar-SA`, `he` | `AR`, `HE` | right to left: not automatic, see below |

## Translation principles

- **Translate the meaning, not the words.** Say the same gain in that language's store language. Instead of a
  literal translation ("Fix any photo" → "Herhangi bir fotoğrafı düzelt"), choose the natural one ("Her fotoğrafı
  tek dokunuşla düzelt").
- **Keep the length close to the source.** German and French usually get noticeably longer. Try shortening first;
  shrinking is the last resort (`minSize`).
- **Move the emphasis to the corresponding word**, even if the word order changes.
- **Break lines at a natural place in that language** (`\n`).
- Number and unit formats follow the language's rules (`4.8` → `4,8`, `120K` → `120 B`).
- If the user wants a native speaker to check, give the translations as a table (image, layer, source,
  translation); move on to Figma after approval.

## Flow

```bash
# 0) If the designer edited the base language in Figma, pull the texts back first (04-figma: read)
# 1) Write the translations into the spec, put language-specific screens under Asset/screens/<locale>/ (sim_capture.sh)
# 2) Length check (with the spec geometry; if positions in Figma differ, this only gives a sense of length)
node $SS/render.mjs spec.json --locales tr,de-DE --scale 0.5
# 3) Figma JS and dryrun (loads the build state into the simulation and tries localize on top of it)
node $SS/figma_js.mjs build spec.json --locales en-US
node $SS/figma_js.mjs localize spec.json --from en-US --to tr,de-DE
node $SS/figma_dryrun.mjs Work/figma/build_en-US.js --state Work/figma/_dry.json
node $SS/figma_dryrun.mjs Work/figma/localize_tr.js --state Work/figma/_dry.json
```

4. Run each language's `localize_<locale>.js` with `use_figma` (the page already exists, languages can go in
   parallel). Save the results as `Work/figma/localize_<locale>.result.json`.
5. Read the `texts` report: `shrunk` is informational; `ERROR: does not fit, shorten the text` means shorten
   that text in the spec. Fixing it requires rebuilding that language's row (`--replace`); **ask** whether the
   designer touched the row, and if so, suggest fixing the text by hand in Figma.
6. If `uploads` is not empty (language-specific screens), `upload_assets` + `figma_upload.py`, as in the build.
7. One frame's `get_screenshot` per language.

Cloning carries everything the designer did: positions, colors, extra layers. When the text changes, the font and
color of the longest segment are kept as the base, and the first segment in a different color is kept as the
emphasis. If a language-specific font (`byLocale`) is defined, the font is changed for that language and colors
are kept. Badges grow with the text and are re-centered if center-anchored.

## Right-to-left languages

Not supported automatically. For Arabic/Hebrew open a separate set (`SS0n`), use `align: "right"` in the spec and
mirror horizontal positions (`x' = 1320 - x - w`), move the device to the right if needed, and take RTL screens from
the simulator. Tell the user up front that this is a separate job.
