# 10 · App lookup: registry first, then Figma, then the web

When the user names an app ("a set for Lumen", "set up Lumen's brand"), **pin down which app it is** before
doing anything else. Many apps share a name: an App Store search for "Lumen" returns several "Lumen" apps from
different publishers. Working with the wrong app's screens or brand is the most expensive mistake.

The order is always the same: **registry → Figma → web → confirm → write to the registry.**

```bash
ROOT=<project folder>     # ~/Desktop/Projects or the connected folder
```

## 0. Registry

```bash
python3 $SS/app_lookup.py find "<name>" --root "$ROOT"
```

`<ROOT>/_registry/apps.json` holds apps that were confirmed before (name, code, aliases, App Store ID,
publisher, Figma files). It matches fuzzily on name, code (`LMN`) or alias.

- **One clear match** (score 0.9 or higher, or a code match): say it in one sentence and carry on, do not ask
  again: *"Lumen (LMN): 'Lumen: AI Photo Editor' on the App Store, the Lumen UI file in Figma."*
- **Several matches or a weak one:** ask which one.
- **Not in the registry**, or Figma info missing: follow the steps below.

## 1. Figma

The Figma MCP cannot search files by name; it can search libraries and design system assets. That needs any
Figma file of the team as context (`figmaHome`, ideally the shared design system file):

```bash
python3 $SS/app_lookup.py figma-home --root "$ROOT"                    # is one saved?
python3 $SS/app_lookup.py figma-home --root "$ROOT" --set "<link>"     # if not, ask the user once and save it
```

Then, in order:

1. If the registry has a Figma link for this app, list its pages with `get_metadata(fileKey)` (no nodeId) to
   confirm the file is reachable.
2. `get_libraries(fileKey = figmaHome)`: libraries already added and those available in the organization.
   Pick out the ones whose name or description contains the app name (or its code).
3. In one call, `search_design_system(fileKey = figmaHome, queries = [{component: "<name>"}, {style: "<name>"},
   {variable: "<name>"}])`. Look at the library names and asset names in the results.
4. Show what you found briefly: *"Figma has a 'Lumen UI Kit' library (components and color styles) and
   'LMN Brand' Variables."* If the match is fuzzy, ask "is this it?".
5. If nothing turns up, say so plainly and ask the user for the link: *"I can't search Figma files by name;
   could you search in Figma and paste the file link? Otherwise we can skip this step."*

What you find in Figma feeds the later work: color styles and Variables in the library are the source of the
brand ([09-brand-system](09-brand-system.md), `tokens.mjs read`), and the app design file shows the current
state of the screens (the device frame still gets a real app screenshot).

## 2. Web (App Store)

```bash
python3 $SS/app_lookup.py store "<name>" --root "$ROOT" --country us -n 6
```

Candidates come with name, publisher, rating and rating count, category, release date and link. Publishers
confirmed before (your own publisher accounts) come first with `ownPublisher: true`. If the app is not in the
US store, try `--country tr` or another country.

If the script cannot reach the App Store (network restriction), use WebSearch for `"<name>" app store` and read
the apps.apple.com pages with WebFetch to get the same details.

## 3. Confirm (required)

**Never use a web result without confirmation**, even if there is only one candidate. Show the candidates in a
short table, then ask with AskUserQuestion:

- options: the 2-3 most likely candidates, label `Name (Publisher)`, description `rating · rating count · release date`;
- your pick goes first; a candidate from your own publisher, or one that matches the Figma info in the
  registry, gets "(Recommended)";
- the user can type another App Store link via "Other"; then use the `id<digits>` in that link.

If the app code is not in the [app-codes](app-codes.md) table, ask for it in the same question or right after.

## 4. Write to the registry

```bash
python3 $SS/app_lookup.py confirm --root "$ROOT" --name "Lumen" --code LMN --store-id 1234567890 \
  --figma "Lumen UI=<link>" --library "Lumen UI Kit" [--alias "Lumen Photo"] [--country us]
```

It writes the registry (`_registry/apps.json`; the publisher is marked as your own and ranks first in later
searches) and `<ROOT>/<App>/_app/`: the icon, the current screenshot set from the App Store, the description
and metadata.

Then show the user a contact sheet of the current set
(`imgtools.py sheet "<ROOT>/<App>/_app/current_*" -o ... --labels`); the new set is compared against it. If
there is no brand file yet, the seed color candidate is measured from the icon (`imgtools.py palette _app/icon.jpg`).

## Rules

- Only information the user confirmed goes into the registry.
- The registry file lives in the team's shared folder; it can be edited by hand, do not delete it.
- If the user says "the registry is wrong", fix it (running `confirm` again with the same code updates the entry).
