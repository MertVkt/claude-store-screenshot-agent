---
name: screenshot-set
description: 'Produces App Store and Google Play screenshot sets end to end: competitor analysis, a spec built on brand tokens, preview and automatic QC (fit, overlap, contrast), setup in Figma as editable native layers (bound to Variables and text styles), then localization and delivery. Use when the user asks for a "screenshot set", "store screenshots", "App Store screenshots", "Play Store screenshots", "design screenshots", "build screenshots in Figma", PPO / Custom Product Page screenshots, or competitor screenshot analysis.'
---

# Screenshot set

The user is a designer and does not see a terminal. You run the commands; show them only results, images and
decisions. Reply in the user's language; keep it short and warm. Refer to files by name, not by path.

## Environment

The folder given when this skill opens is `SKILL_DIR`. The reference files were written for a Claude Code setup;
their equivalents in this environment:

| In the references | Here |
|---|---|
| `$SS` | `SKILL_DIR/scripts` |
| `$PY` | `python3` |
| `newshots "<App>" <CODE>` | `SS_ROOT="<project folder>" SS_SKILL="SKILL_DIR" bash SKILL_DIR/scripts/newshots.sh "<App>" <CODE>` |
| `~/Desktop/Projects` | the project folder the user connected |
| `magnific`, `gemini-qc` (optional paid image / QC tools some references mention) | not included |
| `sim_capture.sh` | macOS with Xcode only; otherwise ask for screens (see below) |
| `FIGMA_TOKEN` | none; export is covered by [deliver-screenshots](../deliver-screenshots/SKILL.md) |

**On first use** (and whenever a script says it cannot find something) run once:

```bash
node -v && python3 -V && bash SKILL_DIR/scripts/setup.sh
```

- If `node` is missing, stop and tell the user (Node 18+ is required).
- If Chromium does not download, the preview will not work. In that case **use Figma as the preview**: build the
  spec directly in Figma and check each row with one `get_screenshot`. Contrast cannot be measured in this case;
  say so.

**Project folder:** if no folder is connected, ask the user to connect your screenshot projects folder.
Layout: `<folder>/<App>/_brand/` (brand) and `<folder>/<App>/<CODE>SS<nn>/` (set).

**Figma:** the plugin brings the Figma connection; the user grants permission on first use. Check the seat with
`whoami`: writing requires a **Dev or Full** seat on a Professional/Organization/Enterprise plan. With a
View/Collab seat you cannot write to Figma; tell the user and continue with the preview PNGs.

**Save tool results to files:** save `use_figma` and `upload_assets` responses verbatim as
`Work/figma/<name>.result.json` and `Work/figma/<name>.urls.json`; later scripts read them.

**Trial run:** if the user says "try it with the example", copy the `SKILL_DIR/assets/example/Demo Photo/` folder
into the project folder; it contains a brand (`_brand/DMO.tokens.json`) and a bilingual 3-image set (`DMOSS01`).
The screens are fake demos and are not used in real work.

## Rules

1. **No deleting in Figma.** Deleting, overwriting (`--replace`, `--update`) or renaming a frame, Variable or
   style requires the user's explicit approval. If a script returns `EXISTS` or `conflicts`, stop and ask.
2. **No invented UI.** The screens inside the device come from the real app (from the PM or developer,
   `Asset/screens/<locale>/`). If they are missing, ask for them; do not draw them or generate them with AI.
3. **No invented claims.** Ratings, download counts and "#1" only with real data; write the source in
   `PRODUCTION.md`.
4. **Each set in its own folder.** The app code is in the [app-codes](reference/app-codes.md) table; if it is
   not there, ask, do not invent one. Revisions and new languages go in the same set; a new concept or a PPO
   alternative goes in a new set.
5. **Measure what you deliver.** No delivery until `verify_shots.py` exits with 0.
6. **This agent does not generate paid AI images by itself.** If a background or object image is needed, it comes
   from the user (their own generation, stock, Figma). Text is never baked into an image.

## Flow

| # | Stage | What happens | Details |
|---|---|---|---|
| 0 | Pin down the app | if the user named an app, **first** run [find-app](../find-app/SKILL.md): registry, Figma, web, confirmation | [10-app-lookup](reference/10-app-lookup.md) |
| 0b | Preparation | setup, project folder, app code; if there is no brand, first [brand-system](../brand-system/SKILL.md); then `newshots.sh` | above |
| 1 | References | competitor sets (`store_refs.py`; if the network is closed, ask the user to put them in `Ref.Shots/`), contact sheet, pattern table | [01-references](reference/01-references.md) |
| 2 | Screens | `Asset/screens/<locale>/01.png ...`; check ratio and cleanliness with `imgtools.py info` | [01-references](reference/01-references.md#real-screens) |
| 3 | Copy | one promise per image, 2 lines; the first 3 images carry the story | [05-localization](reference/05-localization.md) |
| 4 | Spec and preview | `render.mjs`; fix until there are 0 ERROR; present options with a contact sheet | [02-spec](reference/02-spec.md), [07-qc](reference/07-qc.md), [09](reference/09-brand-system.md) |
| 5 | Figma | if the brand is not in Figma yet, first `tokens.mjs figma`; then `figma_js.mjs build`, dryrun, `use_figma`, image upload, one `get_screenshot` | [04-figma](reference/04-figma.md) |
| 6 | Designer round | the user edits in Figma; when asked, pull the texts back into the spec with `figma_js.mjs read` | [04-figma](reference/04-figma.md#pulling-designer-edits-back-into-the-spec) |
| 7 | Localization | [localize-screenshots](../localize-screenshots/SKILL.md) | |
| 8 | Delivery | [deliver-screenshots](../deliver-screenshots/SKILL.md) | |

Pitfalls: [08-pitfalls](reference/08-pitfalls.md). Skim it before starting a new job.

## Fallback for uploading images to Figma

If `figma_upload.py` gives a network error (this environment cannot reach Figma's upload address), the images stay
as gray placeholders in Figma. Give the user a short list: which layer (`img:phone.screen`, `img:bg` ...) in which
frame gets filled with which file. Selecting the layer in Figma and choosing the file via Fill > Image is enough;
position and corner radius are already correct.

## Working style

- First say in one sentence what you are about to do, then do it. Show the preview and the Figma screenshot.
- Where a choice is needed (layout, color, message order), render 2-3 spec variants into separate folders, ask with
  side-by-side contact sheets, and put your recommendation first.
- Before writing to Figma, say what will be written (which page, how many frames).
- When done: what was produced, the Figma link, a QC summary, open items. Go into technical detail only if asked.
