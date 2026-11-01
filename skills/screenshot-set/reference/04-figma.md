# 04 · Figma: push with native layers, designer round, reading back

What goes to Figma is **an editable design**, not a picture: real text layers (font, size, accent color), a vector
device frame, images as fills, gradients, shadows, auto layout badges. The designer can change everything by hand.

## Setup and access

```bash
claude plugin install figma@claude-plugins-official     # Figma MCP + figma-use skills
# or the server only:  claude mcp add --transport http figma https://mcp.figma.com/mcp
```

Inside Claude Code, pick figma with `/mcp` and authorize it in the browser. Then check the seat with the `whoami`
tool:

- **Writing** (use_figma, upload_assets) requires a **Dev or Full** seat on a Professional, Organization or
  Enterprise plan.
- Starter plan or View/Collab seat: read only, and 6 tool calls a month. Pushing is not possible in this case;
  tell the user and continue with the preview PNGs.
- Dev/Full seats have a per-minute limit (same as Figma REST Tier 1). Figma may change these limits; on a rate
  limit error, check the status with `whoami`.

For export you also need a personal access token: Figma > Settings > Security > Personal access tokens, scope
`file_content:read`. Put `FIGMA_TOKEN=...` in `~/.config/store-screenshot-agent/.env`.

## File layout

| In Figma | Name | Source |
|---|---|---|
| File | the link the user gives (otherwise `create_new_file`; if there is more than one team, ask) | |
| Page | `LMN SS01` (code + space + set) | spec `code`, `set` |
| Row | one row per language, with a `label:<locale>` text above it; order is the `locales` order | |
| Frame | `LMNSS01_en-US_01` (in a panorama `LMNSS01_en-US_pano`) | export finds frames by this name |
| Layer | `text:headline`, `badge:rating`, `device:phone`, `img:phone.screen`, `img:bg`, `shape:glow` | localization finds layers by these names |

The file key comes from the link: `figma.com/design/<KEY>/<name>?node-id=...`. Write the key to `Brief/README.md`
and `PRODUCTION.md`.

## Build: a new row from the spec

If the spec is tied to a brand (`brand`) and the brand has not gone to this Figma file yet, **brand first**:
`tokens.mjs figma` ([09-brand-system](09-brand-system.md#figma-variables-and-styles)). Without it the build still
runs, but colors are not bound to Variables and texts are not bound to text styles (`warnings` says so).

Prerequisite: the preview is clean (no ERROR in `qc.json`) and `fit.json` is current. Load the skills
the Figma plugin requires (`figma-use`; for design the plugin also asks for `figma-generate-design`). Our JS does
not use library components; the `search_design_system` step is skipped unless the user wants to tie into a
company library.

```bash
node $SS/render.mjs spec.json --locales en-US --scale 0.5          # must show 0 ERROR
node $SS/figma_js.mjs build spec.json                               # Work/figma/build_en-US.js
node $SS/figma_dryrun.mjs Work/figma/build_en-US.js                 # must say DRYRUN OK
```

1. One sentence to the user: *"I'm writing the en-US row (5 frames) to the LMN SS01 page."*
2. `use_figma(fileKey, code = the content of build_en-US.js verbatim, description, skillNames: "figma-use")`.
   Save the returned JSON **as is** as `Work/figma/build_en-US.result.json`.
3. If the result is `error: "EXISTS"`, **stop**. Frames with the same names already exist in Figma; most likely
   the designer worked on them. Tell the user which frames exist; options: a new set code (recommended) or, with
   explicit approval, `--replace` (the old ones are deleted).
4. If `uploads` is not empty: `upload_assets(fileKey, count = uploads.length, nodeIds = uploads[].nodeId in the
   same order, scaleMode = "FILL", currentPageId = page)`. Save the response as `Work/figma/build_en-US.urls.json`.
   If there are more than 60, call in chunks of 60 and save each response to a separate file.
5. `$PY $SS/figma_upload.py Work/figma/build_en-US.result.json Work/figma/build_en-US.urls.json`
6. Check: take `get_screenshot(fileKey, nodeId = boards[0].id)` for **one** frame and compare it with
   `Work/preview/en-US/<same name>.png` (position, font, accent color, are the images filled). Do not take a
   screenshot of every frame; there is a call limit.
7. Give the user the Figma link: `https://www.figma.com/design/<KEY>?node-id=<page id, with - instead of :>`.

If several languages are built at once (`--locales en-US,tr`), run the first file alone (it creates the page),
then send the rest in parallel in one message. But the usual path is: base language only first, the designer
round, then `localize`.

If you see "Font not available in the Figma account" in `warnings`, tell the user: the font must
be installed in the account/organization, or the spec must switch to a Google Fonts font. Do not deliver a row
that fell back to Inter.

## Designer round

A short note to pass on to the designer (can be sent as is):

> You can change anything you like in the frames: color, position, size, font, shadow, new decorative layers.
> Don't touch three things: frame names and sizes (export depends on them), layer names starting with `text:`,
> `badge:` and `img:` (translations slot in by these names), and don't convert texts to outlines. If you add a new
> text that needs translating, name it `text:newname` and tell me.

## Pulling designer edits back into the spec

If the designer changed the text, translations must not be made from the old text:

```bash
node $SS/figma_js.mjs read spec.json --locale en-US        # Work/figma/read_en-US.js
```

Run it with `use_figma` and save the result as `Work/figma/read_en-US.result.json`. For every returned `text:*` and
`badge:*`, update the base-language text in the spec (emphasis comes back as `*...*`). If there are new `text:`
layers, add them to the spec as layers of the relevant image (position from the returned `x`, `y`). List every
changed text to the user; only then move on to translation.

## Why we do not regenerate from the spec

Once it is in Figma, the designer's work is not in the spec. `build --replace` deletes that work. That is why
localization clones the row in Figma ([05-localization](05-localization.md)) and export pulls from Figma
([06-delivery](06-delivery.md)). Regenerating from the spec is only done if Figma was never touched or the user
explicitly says "build it from scratch".

## Call budget

| Job | use_figma | upload_assets | get_screenshot |
|---|---|---|---|
| Build for one language | 1 (as many as there are parts if large) | 1 (per 60 images) | 1 |
| Localization for one language | 1 | 0-1 (if there are language-specific screens) | 1 |
| Read | 1 | | |

If you get an error, reproduce it in the dryrun first, fix it, then retry with a single call. Do not try the same
error twice in Figma.
