---
name: brand-system
description: Sets up an app's brand tokens (color palette, color roles, typography, spacing and shadow in W3C DTCG format), measures their contrast, pushes them to Figma as Variables and text styles, pulls changes back from Figma, and gives the developer CSS/Swift output. Use when the user asks for a "brand system", "design system", "color palette", "brand tokens", "Figma Variables", "set up text styles", "contrast check", or when an app has no brand file before starting its screenshots.
---

# Brand system

The scripts and the detailed guide live in the [screenshot-set](../screenshot-set/SKILL.md) skill. If this skill's
folder is `SKILL_DIR`, then `SS=SKILL_DIR/../screenshot-set/scripts`. For environment, rules and the Figma seat
check, first apply the **Environment** and **Rules** sections of screenshot-set. Full guide:
[09-brand-system](../screenshot-set/reference/09-brand-system.md).

## Flow

0. **Pin down the app:** if a name was given, first run [find-app](../find-app/SKILL.md). If the app's library was
   found in Figma, take colors and fonts from there (`get_variable_defs` or the style results in the library file),
   show them to the user, get approval; write those values into the tokens file. Do not generate a palette from
   scratch.
1. **Code and folder:** the app code comes from [app-codes](../screenshot-set/reference/app-codes.md). The brand
   file is `<project folder>/<App>/_brand/<CODE>.tokens.json`. If it exists, use it; do not rebuild it.
2. **Seed color:** do not eyeball it. `find-app` downloads the icon and the current store set to `<App>/_app/`;
   measure from there: `python3 $SS/imgtools.py palette <image>` and `pick`. Show the user 2-3 candidate hex
   values and let them choose.
3. **Build and measure:**
   ```bash
   node $SS/tokens.mjs init --code LMN --app Lumen --seed "#FF5A36" --theme dark \
     --display "Inter:Extra Bold:800" --body "Inter:Medium:500" -o "<App>/_brand/LMN.tokens.json"
   node $SS/tokens.mjs check "<App>/_brand/LMN.tokens.json"
   ```
   The font name and style must match the name in Figma exactly (`Extra Bold`, `Semi Bold`). If the user has a
   brand font, ask. If `check` reports an error, move the role to another tone in the palette (the
   `color.role.<name>` alias in the tokens file) and measure again.
4. **Push to Figma:**
   ```bash
   node $SS/tokens.mjs figma "<App>/_brand/LMN.tokens.json"
   node $SS/figma_dryrun.mjs "<App>/_brand/figma/brand_LMN.js"
   ```
   Tell the user first: *"The LMN Brand Variables collection and the LMN/headline, sub, badge styles will be
   added to this Figma file."* Then pass the file's content to `use_figma`. If `conflicts` comes back, **stop**:
   the values in Figma differ, the designer may have changed them. Show the user the differences as a table and
   ask: take Figma as the source (`tokens.mjs read` → `use_figma` → save the result → `tokens.mjs merge`) or
   write the tokens to Figma (`tokens.mjs figma --update`, with explicit approval).
5. **Developer output (if asked):** `node $SS/tokens.mjs export "<App>/_brand/LMN.tokens.json"` →
   CSS variables, Swift colors and flat JSON under `_brand/dist/`.

## Result

To the user: a small visual of the palette and roles (roles and their hex values), the contrast table
(pass/fail), and what was created in Figma. Remind the designer: changing a role color such as `role/accent` in
Figma changes every bound screenshot layer together; to make the change permanent, they only need to tell me
"update the brand from Figma".
