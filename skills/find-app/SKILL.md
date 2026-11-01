---
name: find-app
description: 'Pins down the exact app from the name the user gives: checks the team registry first, then Figma (libraries, Variables, styles, saved files), then the web (App Store); has the user confirm anything found on the web and writes it to the registry. Use whenever the user names an app ("for Lumen", "Lumen''s brand", "Lumen screenshots") at the start of any screenshot, brand, localization or delivery task, or asks "find this app", "which app is this", "is X in Figma".'
---

# Find app

The scripts live in [screenshot-set](../screenshot-set/SKILL.md): `SS=SKILL_DIR/../screenshot-set/scripts`,
`ROOT` = the connected project folder. Apply the **Environment** section of screenshot-set first. The full flow:
[10-app-lookup](../screenshot-set/reference/10-app-lookup.md); follow it step by step.

Summary, in a fixed order:

1. **Registry:** `python3 $SS/app_lookup.py find "<name>" --root "$ROOT"`. If there is one clear match, say it in
   one sentence and carry on.
2. **Figma:** saved links (`get_metadata`), then `get_libraries` via `figmaHome` and a single
   `search_design_system` call. If there is no `figmaHome`, ask the user once for a link to any Figma file of the
   team. Do not hide that files cannot be searched by name; if nothing is found, ask for the link or skip the step.
3. **Web:** `python3 $SS/app_lookup.py store "<name>" --root "$ROOT"`; without network, WebSearch + WebFetch.
4. **Confirm:** show the candidates in a short table and let the user pick with AskUserQuestion. Never use one
   without confirmation, even if there is only one. If the code is not in the table, ask.
5. **Registry:** `python3 $SS/app_lookup.py confirm ...`; show the contact sheet of the current store set.

Then go back to what the user actually asked for (screenshot set, brand, localization, delivery).
