# 08 · Pitfalls

Source tags: **[measured]** tested in this package, **[docs]** from Figma/Apple documentation, **[verify on first
run]** not yet tried in a real Figma file; measure the behavior on the first real set and update this line.

## Figma MCP / Plugin API

- `node.rotation` rotates around the top left corner; CSS rotates around the center. The builder computes
  `relativeTransform` around the center; do not use `rotation`. **[docs]**
- `createImageAsync` is not supported inside use_figma; images are uploaded with `upload_assets` into the fill of a
  placeholder rectangle. **[docs]**
- One `scaleMode` per `upload_assets` call. That is why the box of `contain` images is shrunk to the image's ratio
  and all of them go with `FILL`; same result on both sides. **[measured: layout]**
- The use_figma `code` field is at most 50,000 characters. If `figma_js.mjs` exceeds 48,000, it splits the boards
  into parts (`_part1.js`, `_part2.js`); run them in order. **[docs]**
- In every use_figma call the page context returns to the first page; `figma.currentPage = ...` throws. The
  script uses `setCurrentPageAsync`. **[docs]**
- Font style names have spaces: `"Extra Bold"`, `"Semi Bold"`. If misspelled, loading fails and it switches to
  Inter; read `warnings`. **[docs]**
- Colors are in the 0-1 range; a paint `color` has no `a` (opacity is separate), effects and gradient stops do have
  `a`. The dryrun checks both. **[docs, dryrun]**
- Text is set up with `textAutoResize = 'HEIGHT'` + a fixed width; the default mode collapses the width to zero.
  **[docs]**
- Starter plan / View seat: read only, 6 calls a month. Do not waste attempts on a push in this case. **[docs]**
- In current typings `blurType: 'NORMAL'` is required for `LAYER_BLUR`; `spread` in a shadow is only valid on
  rectangles/ellipses (or on a frame with a fill and `clipsContent` on), so 0 is sent on the device frame. **[docs]**
- `fontSize` and `lineHeight` return `figma.mixed` when a text has mixed styles; the scripts report it as
  `"mixed"`, the line count cannot be computed and the report says `CHECK`. **[docs]**
- In real Figma, the exact shape of the `upload_assets` response, the CSS equivalent of layer blur (Figma radius
  ≈ 2 × CSS blur was assumed) and shadow spread are **[verify on first run]**. `figma_upload.py` looks for URLs in
  the response regardless of its shape.

## Brand and Variables

- Text shrunk to fit is detached from its text style (in Figma, changing a property that belongs to a style breaks
  the link). `warnings` says which layer. **[docs]**
- If a Variable's value in Figma differs from the spec, the build does not bind it and writes a plain color. This
  means the brand has drifted between Figma and tokens: `tokens.mjs read` + `merge`. **[measured: dryrun]**
- `@material/material-color-utilities` 0.4.0 throws an ESM import error in Node; that is why the HCT palette uses
  color.js. **[measured]**
- A new Variables collection's mode is named `Default`; there is no second mode (dark/light) yet.

## Differences between preview and Figma

- Word wrapping can differ by a few pixels between Chrome and Figma: a long line fits in one and wraps in the
  other. Break headline lines by hand with `\n` and give `maxLines`. **[measured: preview side]**
- Line height percentage is a percentage of font size on both sides; the top gap of the first line can shift by
  1-3 px depending on the font's metrics. **[verify on first run]**
- A font loaded from Google Fonts needs internet in the preview. If it does not load, it draws with a fallback font
  and QC gives an **ERROR**; do not ignore this error, the measurements will be wrong. **[measured]**
- `fit.json` comes from the preview. If the designer changed the font in Figma it is invalid; localization does its
  own fitting inside Figma.

## Localization

- If the designer renames a `text:` layer, that layer is not translated; `warnings` shows "text layer not found".
- If a text has more than two styles (e.g. three colors), cloning keeps only the base (the longest segment) and the
  first segment that differs from it.
- In a panorama the same `id` can appear in different images; `@<image>` is appended to names
  (`text:headline@02`). **[measured]**
- `-AppleLanguages` only works if the app is translated into that language; otherwise the screen comes up in
  English.

## Store and files

- The App Store rejects PNGs with an alpha channel. Figma PNGs may come as RGBA; `figma_export.py` flattens them,
  `verify_shots.py` checks. **[docs]**
- Cover-scaling from the 6.9" master crops ~6 px top and bottom for 6.5" and ~1 px for 6.3". Do not place important
  elements closer than 20 px to the edge. **[measured]**
- The iTunes API's large-size URL trick may not work for every image; the script falls back to the small one. Do not
  take pixel measurements on a small image.
- The simulator's status bar setting resets on restart; `launch` sets it again in every session.

## Shell

- In zsh, if a glob does not match the command stops: quote it like `"Final/*/*.png"`; the scripts expand the glob
  themselves.
- If `$PY` (venv) is missing: `python3 -m venv ~/.local/share/store-screenshot-agent/venv && ~/.local/share/store-screenshot-agent/venv/bin/pip install pillow`.
