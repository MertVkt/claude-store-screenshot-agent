# 01 · Reading references and real screens

## Downloading competitor sets

Apple's public iTunes API works without a key. The search order also shows who leads the category.

```bash
python3 $SS/store_refs.py search "photo editor" --country us -n 10      # id, rating, rating count, image count
python3 $SS/store_refs.py get 1234567890 987654321 --country us -o Ref.Shots/
python3 $SS/store_refs.py get 1234567890 --country de -o Ref.Shots/     # the competitor's German set
$PY $SS/imgtools.py sheet "Ref.Shots/<app>/us_iphone_*.png" -o Work/ref_<app>.png --labels --h 600
```

- Download your own app's current set the same way; the new set is compared against it.
- The URL the API returns is small. The script asks for a larger size by bumping the size at the end of the path,
  and falls back to the small one if that fails. Do not take pixel measurements on a small image, only extract
  patterns.
- Change the country to see localized sets. If a competitor uses a different message order in a language, note it.

## What to extract: the pattern table

For each competitor, look at the contact sheet and write this table to `Brief/references.md`. Do not eyeball it;
measure everything you can (`imgtools.py pick` and `palette`).

| Column | What to write |
|---|---|
| Order | 1..10 |
| Message | the image's single promise, in your own words |
| Layout | headline on top + device below / headline at bottom / tilted device / device-free feature card / panorama / before-after split / social proof |
| Headline | word count, line count, approximate size (headline height / canvas height) |
| Color | background and accent hex (`palette`) |
| Device | yes/no, frame type, angle, does it overflow the frame |
| Note | a notable technique or trick |

Then add a three-line summary under the table: what the first image in the category says, which pattern
dominates, and what our difference will be.

## Common patterns (starting values on a 1320×2868 canvas)

| Pattern | Layout | When |
|---|---|---|
| Headline on top, device below | headline y 200-700, device `w` 950-1050, `y` 750-850, overflows at the bottom | default; easiest to read |
| Headline at bottom | device on top, headline y 2300-2700 | to change the rhythm within the series |
| Tilted device | `rotate` between -4 and -8, with a badge or stars | social proof, "loved by" message |
| Panorama | `panorama: true`, bridge device over the boundary | 3-5 image flow story |
| Device-free feature card | large icon/object + headline + 2-3 bullet badges | feature list, privacy, "no ads" |
| Before/after | two `image` layers half and half, a line `shape` in the middle | photo, editing, cleaner apps |

The first image matters most: in search results the first three images appear at a small size. The headline must
be readable at that size too; `render.mjs` warns for headlines below 0.06 × canvas width.

## Real screens

The screen inside the device **always** comes from the real app. There are two ways:

**1. Simulator (preferred).** Gives a clean status bar and language control.

```bash
bash $SS/sim_capture.sh boot "iPhone 17 Pro Max"          # 6.9" = 1320×2868
bash $SS/sim_capture.sh launch com.company.app en-US       # 9:41, full battery, full signal
# ask the user (or the app's debug menu) to navigate to the desired screen
bash $SS/sim_capture.sh shot Asset/screens/en-US/01.png
bash $SS/sim_capture.sh launch com.company.app tr && bash $SS/sim_capture.sh shot Asset/screens/tr/01.png
```

If the app's source is not available (store only), ask the team for these screens, or ask the user to take
screenshots on their device and put them in `Asset/screens/<locale>/`.

**2. Images from the team.** Measure first:

```bash
$PY $SS/imgtools.py info "Asset/screens/*/*.png"
```

- The ratio should be close to 1320:2868 (0.460). If it differs, it is cropped from the center with `cover`
  inside the device; if important UI sits in the cropped area, tell the user.
- If the status bar shows a real time, low battery or a notification, have it retaken or suggest the simulator
  route.
- If personal data is visible (real name, email, phone, photo), it is not used; retake it with a demo account.

Screen names go in order (`01.png`, `02.png` ...) and keep the same name in every language; the spec picks by
language.
