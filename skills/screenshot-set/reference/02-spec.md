# 02 · spec.json: the single source

The whole set lives in one file. `render.mjs` and `figma_js.mjs` read the same file; geometry is computed once in
`layout.mjs`. Coordinates are canvas pixels (top left is 0,0). Paths are relative to the spec's folder.

## Top level

```json
{
  "app": "Lumen", "code": "LMN", "set": "SS01",
  "canvas": "iphone-6.9",
  "panorama": false,
  "locales": ["en-US", "tr", "de-DE"],
  "baseLocale": "en-US",
  "fonts":  { "display": {...}, "body": {...} },
  "colors": { "bg": "#0E0E12", "ink": "#FFFFFF", "accent": "#FF5A36", "muted": "#B9B9C6" },
  "background": { ... },
  "layers": [ ... ],
  "shots": [ { "id": "01", "keyword": "FixAnyPhoto", "background": {...}, "layers": [...] } ]
}
```

| Field | Meaning |
|---|---|
| `code` + `set` | prefix of file and Figma names: `LMNSS01` |
| `canvas` | `iphone-6.9` (1320×2868), `ipad-13` (2064×2752), `play-phone` (1080×1920) |
| `locales` | App Store Connect language codes; the row order in Figma follows this too |
| `colors` | tokens. In layers use `"color": "accent"` or directly `"#RRGGBB"` / `"#RRGGBBAA"` |
| `background` | set-wide background; an image overrides it with its own `background` |
| `layers` | panorama only: layers spanning the whole set (global coordinates) |
| `shots` | at most 10. `id` is for order and naming, `keyword` is the CamelCase summary in the file name |

## Brand link

If `"brand": "../_brand/LMN.tokens.json"` is given, color roles (`bg`, `ink`, `accent` ...), fonts (`display`,
`body`), `textStyle` presets and the device shadow come from the brand; the `colors` and `fonts` fields are only
used to override deliberately. Details and the `icon` layer: [09-brand-system](09-brand-system.md).

## Fonts

```json
"fonts": {
  "display": { "family": "Inter", "style": "Extra Bold", "weight": 800 },
  "body":    { "family": "Inter", "style": "Medium", "weight": 500,
               "byLocale": { "ja": { "family": "Noto Sans JP", "style": "Medium", "weight": 500 } } }
}
```

- `style` must match the style name in Figma **exactly**: `"Extra Bold"`, `"Semi Bold"` (not joined).
- If `file` is not given, the preview loads from Google Fonts (needs internet). If there is a company font, give
  `"file": "Asset/fonts/Brand-Bold.otf"`; on the Figma side the font must be installed in the account/organization,
  otherwise the build falls back to Inter and says so in `warnings`.
- `byLocale`: a language-specific font (Latin fonts do not cover Japanese, Chinese, Korean, Arabic).

## Background

```json
{ "type": "solid", "color": "bg" }
{ "type": "linear", "angle": 165, "stops": ["#1C1C2B", "#0E0E12"] }
{ "type": "linear", "angle": 90, "stops": [["#2B1055", 0], ["#7597DE", 0.6], ["#0E0E12", 1]] }
{ "type": "image", "src": "Asset/bg/03.jpg" }
{ "type": "image", "src": { "en-US": "Asset/bg/en.jpg", "tr": "Asset/bg/tr.jpg" } }
```

The angle works like CSS: 0 up, 90 right, 180 down. The gradientTransform in Figma is computed from it.

## Layers

Every layer has an `id`, unique within its image. The layer name in Figma is derived from it (`text:headline`,
`device:phone`, `img:phone.screen`). **Localization works with these names**; if the designer renames a layer,
that layer is not translated.

Common fields: `x`, `y`, `opacity` (0-1), `rotate` (degrees, clockwise, around the center).

### text

```json
{ "id": "headline", "type": "text", "role": "headline", "font": "display",
  "size": 132, "lineHeight": 1.02, "letterSpacing": -0.025, "align": "left",
  "x": 110, "y": 230, "w": 1100, "maxLines": 2, "minSize": 100,
  "color": "ink", "accent": "accent",
  "text": { "en-US": "Fix *any* photo\nin one tap", "tr": "Her fotoğrafı\n*tek dokunuşla* düzelt" } }
```

- `*word*` is drawn in the accent color (`accent`). For a literal asterisk use `\\*`.
- `\n` breaks a line. **Break lines by hand**: Chrome and Figma wrap words a few pixels differently, so a
  hand-broken headline looks the same on both sides.
- If `maxLines` is given and the text does not fit, the size shrinks in 2% steps down to `minSize` (default 75%).
  The shrunk size from the preview is written to `fit.json` and the Figma build uses the same size. `"fit": false`
  turns this off.
- `role: "headline"` turns on the small-size warning.
- `letterSpacing` is in em (-0.025 = -2.5%).

### device

```json
{ "id": "phone", "type": "device", "model": "iphone", "x": 160, "y": 800, "w": 1000, "rotate": 0,
  "screen": { "en-US": "Asset/screens/en-US/01.png", "tr": "Asset/screens/tr/01.png" },
  "shadow": true, "body": "#0B0B0E", "edge": "#3A3A40" }
```

- Models: `iphone` (Dynamic Island), `ipad`, `android` (punch-hole camera). Height is computed from width (an
  iPhone with `w` 1000 is about 2093 px). Overflowing at the bottom is normal; the canvas clips it.
- The frame is vector: in Figma the body is a frame, the screen a rounded rectangle (image fill), the island a
  separate layer. The designer can change its color, thickness and shadow.
- `shadow`: `true` or `{ "x": 0, "y": 40, "blur": 120, "color": "#00000059" }` (relative to a 900 px device, scaled).

### image

```json
{ "id": "sun", "type": "image", "src": "Asset/objects/sun.png", "x": 900, "y": 120, "w": 360,
  "fit": "contain", "radius": 0, "shadow": false }
```

- `fit: "contain"` (default): the box shrinks to the image's ratio. Figma gets exactly the same box.
- `fit: "cover"`: give `w` and `h`; the image fills the box and is cropped from the center.
- A transparent object must be a PNG (background removed). See [03-ai-images](03-ai-images.md).

### shape

```json
{ "id": "glow", "type": "shape", "shape": "ellipse", "x": 260, "y": 1100, "w": 800, "h": 800,
  "fill": "#FF5A3655", "blur": 400 }
{ "id": "card", "type": "shape", "shape": "rect", "x": 90, "y": 1800, "w": 1140, "h": 600, "radius": 48,
  "fill": { "type": "linear", "angle": 180, "stops": ["#FFFFFF14", "#FFFFFF05"] }, "stroke": { "color": "#FFFFFF22", "width": 2 } }
```

`blur` is Figma's layer blur radius; the preview draws it as CSS `blur(blur/2)` (roughly equivalent).

### badge

```json
{ "id": "rating", "type": "badge", "font": "body", "size": 46, "anchor": "center", "x": 660, "y": 2190,
  "fill": "#FFFFFF1F", "color": "ink", "text": { "en-US": "★★★★★  4.8 · 120K ratings", "tr": "★★★★★  4,8 · 120 B puan" } }
```

A pill-shaped label. In Figma it becomes an auto layout frame; the width adjusts itself when the text changes.
With `anchor: "center"`, `x` is the center. Ratings and numbers must be **real** (from App Store Connect).

## Panorama

```json
"panorama": true,
"background": { "type": "linear", "angle": 90, "stops": ["#2B1055", "#7597DE", "#0E0E12"] },
"layers": [ { "id": "bridge", "type": "device", "x": 1000, "y": 900, "w": 900, "rotate": 8, "screen": "..." } ],
"shots": [ { "id": "01", "layers": [...] }, { "id": "02", "layers": [...] } ]
```

- Canvas width becomes `1320 × number of images`. Top-level `layers` are in global coordinates; image layers are
  written within their own image (0-1320) and shifted automatically.
- Figma gets a single wide frame (`LMNSS01_en-US_pano`); export slices it. In a panorama, `@<image id>` is
  appended to layer names (`text:headline@02`).
- If text crosses a slice boundary, QC gives an error (a headline split in two cannot be read in the store). A
  device may cross.

## Making variants

To offer options, copy the spec (`spec_A.json`, `spec_B.json`), change only what is being tried, render each into
a separate folder (`--out Work/preview_A`; writing to the same folder overwrites), put the contact sheets side by
side with `imgtools.py sheet` and ask. The chosen one becomes `spec.json`, the other moves to `Work/`.

```bash
node $SS/render.mjs spec_A.json --out Work/preview_A --scale 0.5 --locales en-US
node $SS/render.mjs spec_B.json --out Work/preview_B --scale 0.5 --locales en-US
$PY $SS/imgtools.py sheet Work/preview_A/sheet_en-US.png Work/preview_B/sheet_en-US.png -o Work/options.png --labels
```
