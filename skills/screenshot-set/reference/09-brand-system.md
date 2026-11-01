# 09 · Brand system: tokens, palette, contrast, Figma Variables

Each app has a single brand file, and every screenshot set ties to it:

```
~/Desktop/Projects/<App>/_brand/<CODE>.tokens.json     W3C DTCG 2025.10 format
~/Desktop/Projects/<App>/<CODE>SS01/spec.json           "brand": "../_brand/<CODE>.tokens.json"
```

You define color, font and headline size once; the sets, Figma and the developer read from the same source.

## Open source used

| Source | For what | How |
|---|---|---|
| [W3C Design Tokens (DTCG) 2025.10](https://www.designtokens.org/TR/2025.10/) | the token file format (first stable version, October 2025) | `tokens.json` is in this format; colors are `{colorSpace, components, hex}` |
| [color.js](https://github.com/color-js/color.js) (MIT) | HCT tonal palette, WCAG 2.1 and APCA contrast | `scripts/vendor/color.js` (bundled, no install) |
| [Style Dictionary 5](https://github.com/style-dictionary/style-dictionary) (Apache-2.0) | handing tokens to the developer as CSS / Swift / JSON | `tokens.mjs export` (installed via npm) |
| [Lucide](https://github.com/lucide-icons/lucide) (ISC) | icons in feature cards; editable vectors in Figma | `scripts/vendor/lucide/` (bundled) |
| [Official Figma skills](https://github.com/figma/mcp-server-guide) | source of the rules for Variables, text styles and libraries | comes with the Figma plugin; `tokens.mjs figma` was written to these rules |

Material's color library does not run directly in Node (ESM import error, October 2026). The same HCT tone logic
was built with color.js, with no extra dependency.

## New brand

```bash
cd ~/Desktop/Projects/<App>
node $SS/tokens.mjs init --code LMN --app Lumen --seed "#FF5A36" --theme dark \
  --display "Inter:Extra Bold:800" --body "Inter:Medium:500" -o _brand/LMN.tokens.json
```

- `--seed`: the brand's main color. **Measure** it from the logo or the current store screenshots
  (`imgtools.py pick/palette`); do not eyeball it.
- Palette: from the seed color, a 16-tone `primary` ramp and a low-saturation `neutral` ramp in HCT space (0 black,
  100 white).
- Roles (`color.role.*`): `bg`, `surface`, `ink`, `muted`, `accent`, `onAccent`. They are aliases to palette tones.
  The `accent` tone is picked automatically to give at least 3:1 contrast on `bg`.
- Typography: `headline` (132 px), `sub` (54 px), `badge` (46 px). The Figma style name is in `$extensions`.
- Size and shadow: margin, corner radius, device shadow (relative to a 900 px device, scaled in the spec).

If the brand already exists (old sets, video creatives), write the real colors into the tokens file by hand
instead of a seed; `init` is only a starting point.

## Contrast

```bash
node $SS/tokens.mjs check _brand/LMN.tokens.json
```

Measures role pairs: `ink/bg` and `muted/bg` 4.5, `accent/bg` 3, `onAccent/accent` 4.5 (WCAG 2.1). APCA Lc is
written as information; WCAG is the threshold, APCA is not the decision (not a standard yet).

`render.mjs` also measures the **real pixels under** each text (photo, gradient, glow included). Texts are made
transparent, the background is captured and the pixels within the line boxes are sampled:

- if the median contrast is below the threshold, **ERROR** (the text is lost in the background),
- if only the worst 10% area is below, **WARN** (part of the text lands on a light/dark area).

Threshold: 3 for large text (0.045 × canvas width and above, 59 px at 1320), 4.5 for small text.

## Use in the spec

```json
{ "brand": "../_brand/LMN.tokens.json",
  "background": { "type": "solid", "color": "bg" },
  "shots": [ { "id": "01", "layers": [
    { "id": "headline", "type": "text", "textStyle": "headline", "x": 110, "y": 230, "w": 1100, "maxLines": 2, "text": "..." },
    { "id": "sub", "type": "text", "textStyle": "sub", "color": "muted", "x": 110, "y": 530, "w": 1100, "text": "..." },
    { "id": "lock", "type": "icon", "name": "shield-check", "size": 220, "color": "accent", "x": 550, "y": 1050 },
    { "id": "pill", "type": "badge", "textStyle": "badge", "fill": "accent", "color": "onAccent", "x": 660, "y": 1780, "anchor": "center", "text": "..." }
  ] } ] }
```

- Color names (`bg`, `accent` ...) come from the brand roles. If overridden with `spec.colors`, that layer is not
  bound to the brand (a deliberate deviation; write down why).
- A tone directly from the palette: `"color": "{color.palette.primary.40}"`.
- `textStyle` takes font, size, line height and letter spacing from the tokens; a field written on the layer
  overrides it.
- Icon names are [lucide.dev/icons](https://lucide.dev/icons) names (`shield-check`, `sparkles`, `wand-sparkles`).
  Search: `vendor/lucide/tags.json`.

## Figma Variables and styles

**Before** building sets in Figma, the brand goes to the Figma file:

```bash
node $SS/tokens.mjs figma _brand/LMN.tokens.json              # _brand/figma/brand_LMN.js
node $SS/figma_dryrun.mjs _brand/figma/brand_LMN.js            # DRYRUN OK
```

Run it with `use_figma`. What gets created:

| In Figma | Name | Note |
|---|---|---|
| Variables collection | `LMN Brand` (mode `Default`) | |
| Primitive colors | `palette/primary/40`, `palette/neutral/5` ... | empty scope: hidden in pickers, alias targets only |
| Role colors | `role/bg`, `role/accent` ... | aliases to primitives; visible in fill, stroke and effect pickers |
| Text styles | `LMN/headline`, `LMN/sub`, `LMN/badge` | |
| Effect style | `LMN/device-shadow` | |

Then `figma_js.mjs build` **binds** the set's layers to these: fills using a role color to the Variable, texts using
`textStyle` to the text style. When the designer changes `role/accent`, the accents in every set change together.
Text shrunk to fit is detached from its style (a Figma rule); the result says so in `warnings`.

**The no-delete rule applies here too.** If the collection already exists and its values differ from the tokens,
the script does not touch it and returns a `conflicts` list. The designer may have changed it in Figma. Options:

```bash
node $SS/tokens.mjs read  _brand/LMN.tokens.json      # run with use_figma, save the result as _brand/figma/brand_read_LMN.result.json
node $SS/tokens.mjs merge _brand/LMN.tokens.json _brand/figma/brand_read_LMN.result.json   # take Figma as the source
node $SS/tokens.mjs figma _brand/LMN.tokens.json --update                                 # or, with approval, write tokens to Figma
```

If during the build a Variable's value in Figma differs from the spec, that color is not bound (so it stays the
same as the preview), and `warnings` says so. This is a sign that the brand has drifted between Figma and tokens;
align it with read/merge above.

## Handoff to the developer

```bash
node $SS/tokens.mjs export _brand/LMN.tokens.json      # _brand/dist/LMN.css, LMNTokens.swift, LMN.flat.json
```

Generated with Style Dictionary 5. The Swift file contains colors only (a `UIColor` enum). In-app colors and store
screenshots then come from the same source.
