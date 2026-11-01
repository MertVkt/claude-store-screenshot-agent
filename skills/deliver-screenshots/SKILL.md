---
name: deliver-screenshots
description: 'Turns the final state of a screenshot set in Figma into files ready to upload to the App Store / Google Play: exports the frames, removes transparency, writes iPhone 6.9"/6.5"/6.3" and iPad sizes, verifies them against store rules, and reports with a contact sheet. Use when the user asks to "export", "deliver", "prepare for the App Store", "produce the final files", or "verify the screenshots".'
---

# Screenshot delivery

The scripts are in [screenshot-set](../screenshot-set/SKILL.md): `SS=SKILL_DIR/../screenshot-set/scripts`. First
apply the **Environment** and **Rules** sections of screenshot-set. Full guide:
[06-delivery](../screenshot-set/reference/06-delivery.md).

If an app name was given and it is not clear which set is meant, check the registry first (`app_lookup.py find`);
if needed, run [find-app](../find-app/SKILL.md).

## 1. Get the raw PNGs (from Figma, the designer's final state)

Frame names are `<CODE>SS<nn>_<locale>_<nn>` (in a panorama `..._pano`). Two ways:

- **Claude pulls them:** for each frame, `get_screenshot(fileKey, nodeId, maxDimension = 2868)` (the frame width
  for a panorama). Download the returned address and save it as `Work/export_raw/<frame name>.png`. If the
  download fails because of the network, switch to the second way.
- **The designer exports them:** ask the user to select the frames on the relevant page in Figma, export them as
  **PNG, 1x**, and put the files in the set's `Work/export_raw/` folder. Figma names the files after the frames;
  they must not rename them.

## 2. Produce and verify the delivery files

```bash
python3 $SS/figma_export.py spec.json --raw-dir Work/export_raw [--locales tr]
python3 $SS/verify_shots.py Final/
python3 $SS/imgtools.py sheet "Final/en-US/iPhone-6.9/*.png" -o Work/final_en-US.png --labels --h 700
```

- If the size differs from the canvas, the script stops: the designer may have changed the frame size; the frame
  must stay 1320×2868 (iPad 2064×2752).
- If `verify_shots.py` reports an ERROR, do not deliver; explain the reason to the user in plain words.
- If a WARN says "have the identical image", that language may have been left untranslated; ask.

## 3. Report

To the user: a language × device × count table, the QC summary, the Final contact sheet (shown as an image), open
items. Files are under `Final/<locale>/<device>/`; the upload order in App Store Connect is the sequence number in
the file name. The user does the upload.
