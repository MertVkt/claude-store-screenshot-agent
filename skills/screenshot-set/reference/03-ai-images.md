# 03 · AI images: background, object, texture

This agent does not generate paid AI images by itself; backgrounds and objects come from the user. This page is
for when the user produces them with their own tools. The commands below use `magnific`, an optional paid image
CLI that is not included in this plugin. If the user runs paid generations through the agent with such a tool:
ask which model before every paid generation, and stop at 100 credits. If the tool keeps a credit ledger (for
example `Logs/credits.csv` in the project), use it. This page covers the screenshot-specific part.

## What AI produces and what it does not

| Produces | Does not produce |
|---|---|
| background texture, light over a gradient, abstract scene | app UI (always a real screen) |
| 3D object, icon-like hero object (transparent PNG) | text, headline, badge (must stay editable in Figma) |
| lifestyle photo (person holding a phone, a scene) | brand logo (comes from the brand kit) |
| wide background for a panorama | ratings, awards, press logos |

Text is never baked into an image: it cannot be localized and cannot be edited in Figma.

## Model choice (question template)

When asking, give 2 options on the quality/speed/cost axis plus a recommendation. Credit table (official Magnific
figures, measured 29.09.2026; verify in the panel):

| Job | Recommended | Alternative | Credits |
|---|---|---|---|
| Photorealistic scene, product/object | `nano-banana-pro` (2K) | `seedream-v5-pro` | 75 · 75-150 / image |
| Style, illustration, abstract texture | `flux-2-klein` | `flux-2-pro` | 10-45 · 50-175 / image |
| Extending an existing image (panorama, ratio) | `image-expand-seedream-v4-5` | `flux-pro` (image-expand) | measure in the panel |
| Background removal for an object | `remove-background` | | measure in the panel, log it |
| Upscaling | `image-upscaler-precision-v2` | `image-upscaler` | 72-90 / image |

Example question: *"For the background I recommend `nano-banana-pro` 2K (photorealistic light, 75 credits). The
alternative is `flux-2-klein` (enough for an abstract texture, ~10-45 credits). 3 images + 1 spare = 4
generations, about 300 credits."*

## Size and ratio

- The iPhone canvas is 1320×2868 (about 9:19.5). Models usually give 9:16. Generate the background at 9:16; it is
  cropped vertically with `cover`. So nothing important sits at the top and bottom edges, add "centered
  composition, empty top area for headline" to the prompt.
- The headline area (top 700 px) must be calm: ask for "negative space at top" in the prompt, then check it in
  the preview.
- Panorama background: a 5-image set is 6600×2868 (about 2.3:1). Generate at the widest ratio (21:9), then extend
  with `image-expand` or upscale. Do not let a sharp object land on a slice boundary.
- Generate at least 2K. Figma does not accept more than 10 MB; `figma_upload.py` downsizes if needed.

## Transparent object flow

```bash
magnific run nano-banana-pro -p "glossy 3D sun icon, soft studio light, isolated on plain light gray background, centered" \
  -o Asset/objects/sun_raw.png --extra '{"aspect_ratio":"1:1"}'
magnific run remove-background -i Asset/objects/sun_raw.png -o Asset/objects/sun.png
$PY $SS/imgtools.py info Asset/objects/sun.png        # mode must be RGBA (ALPHA visible)
```

Generate on a plain background in a color different from the object; removal comes out cleaner. If a halo remains
at the edge, zoom in on a dark background in the preview and check.

## Consistency with a reference

If you will ask for the same object from different angles or the same scene in a different color, give a reference
image. In nano-banana-pro the reference key is `reference_images`, and `magnific run -i` **silently ignores** it;
use a helper that passes `reference_images` directly (for example `nbp_ref.py`, not included in this plugin):

```bash
$PY nbp_ref.py -p prompt.txt -r Asset/objects/sun.png -o Asset/objects/moon_raw.png
```

## Logging

After each generation, one line in `PRODUCTION.md`: file, model, gist of the prompt, credits, used or not.
Discarded attempts are logged too (so the next set does not repeat the same mistake).
