# 06 · Delivery: export from Figma, sizes, verification

## Store requirements (checked against the App Store Connect help page in October 2026)

| Class | Accepted portrait sizes | Our folder |
|---|---|---|
| iPhone, Dynamic Island, large (6.9") | 1320×2868, 1290×2796, 1260×2736 | `iPhone-6.9` (master) |
| iPhone, Face ID, large (6.5") | 1284×2778, 1242×2688 | `iPhone-6.5` |
| iPhone, Dynamic Island, medium (6.1"/6.3") | 1206×2622, 1179×2556 | `iPhone-6.3` |
| iPad 13" | 2064×2752, 2048×2732 | `iPad-13` |

- 1-10 images per device size. PNG or JPEG. **Alpha channel and transparency are not accepted.**
- Apple's page treats the medium (Dynamic Island) iPhone class as required and says that if the UI is the same
  across devices, the highest resolution can be scaled down to smaller ones. The rule can change, so we produce all
  three iPhone folders; when uploading, use whatever App Store Connect asks for that day.
- Google Play phone: short side at least 320, long side at most 3840 px, ratio at most 2:1, 2-8 images, under
  8 MB. The `play-phone` canvas is 1080×1920.

Source: developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications.
When in doubt, reread this page and update the table and `ALLOWED` in `verify_shots.py`.

## Export

```bash
$PY $SS/figma_export.py spec.json --file <KEY>                 # all languages
$PY $SS/figma_export.py spec.json --file <KEY> --locales tr    # a single language
```

What it does:

1. Finds the page (`LMN SS01`) via Figma REST and matches frames by name. If a frame is missing, it stops and lists
   them.
2. Downloads 1x PNGs: `Work/export_raw/<frame>.png`. If the size differs from the canvas, it stops (the designer
   may have resized the frame; frame size must stay fixed).
3. Splits a panorama into 1320-wide slices.
4. Drops alpha (warns if there are transparent pixels).
5. Cover-scales from the master to the other sizes (at most a few pixels are cropped).
6. Writes: `Final/<locale>/<device>/<CODE><SET>_<LANG>_<nn>_<Keyword>_<WxH>.png`

```
Final/en-US/iPhone-6.9/LMNSS01_EN_01_FixAnyPhoto_1320x2868.png
Final/tr/iPhone-6.3/LMNSS01_TR_01_FixAnyPhoto_1206x2622.png
```

The keyword comes from `keyword` in the spec, otherwise it is derived in CamelCase from the base-language headline,
and it is **the same in every language** (only the language code changes). `nn` is the order in the store.

If there is no `FIGMA_TOKEN` or REST is closed: for each frame download the PNG with
`get_screenshot(nodeId, maxDimension = 2868)` (the width for a panorama), save it as
`Work/export_raw/<frame name>.png` and run `figma_export.py spec.json --raw-dir Work/export_raw`. The size check
works the same way.

## Verification

```bash
$PY $SS/verify_shots.py Final/
$PY $SS/imgtools.py sheet "Final/en-US/iPhone-6.9/*.png" -o Work/final_en-US.png --labels --h 700
```

What `verify_shots.py` measures: size (allowed for the device class?), alpha, count (1-10, Play 2-8), equal counts
across languages, color profile, file size, naming scheme and **byte-identical images across languages** (may have
been left untranslated). If the exit code is not 0, there is no delivery.

Then look at the Final contact sheet yourself (the visual checklist in 07-qc).

## Report

To the user:

| Language | iPhone-6.9 | iPhone-6.5 | iPhone-6.3 | Note |
|---|---|---|---|---|
| en-US | 5 | 5 | 5 | |
| tr | 5 | 5 | 5 | headline 01 shrank 132 → 112 px |

Plus: the Figma link, credits (if a credit ledger such as `Logs/credits.csv` was used), open items. Send the Final
contact sheet as a file. The user does the upload to App Store Connect; ordering follows `nn` in the file name.
