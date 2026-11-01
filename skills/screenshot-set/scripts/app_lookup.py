#!/usr/bin/env python3
"""app_lookup.py : finds the right app from an app name. Order: registry -> Figma (Claude, via MCP) -> web.

Registry: <project folder>/_registry/apps.json. Every confirmed app is written here, so the second time
no search is needed. The Figma search is done by Claude with MCP tools; this script only manages the
registry and the App Store search.

  python3 app_lookup.py find  "<name>" --root <folder>              # search the registry (code, name, alias; fuzzy)
  python3 app_lookup.py store "<name>" --root <folder> [--country us] [-n 8]
        # search the App Store; ranks your own registered publisher accounts first; JSON candidate list
  python3 app_lookup.py confirm --root <folder> --name "Lumen" --code LMN --store-id 123 [--country us]
        [--figma "<name>=<link>" ...] [--alias "Lumen Photo"] [--library "<Figma library name>"]
        # writes the confirmed app to the registry (and marks its publisher as your own), downloads store
        # metadata + the current screenshots into <folder>/<App>/_app/
  python3 app_lookup.py figma-home --root <folder> [--set "<figma link>"]
        # read/write the context file for Figma library search (any Figma file of the team)
"""
import argparse, difflib, json, re, sys, unicodedata, urllib.parse, urllib.request
from datetime import date
from pathlib import Path

API = "https://itunes.apple.com"


def norm(s):
    s = (s or "").replace("ı", "i").replace("İ", "I")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def score(q, name):
    a, b = norm(q), norm(name)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    r = difflib.SequenceMatcher(None, a, b).ratio()
    if a in b.split(" ") or b.startswith(a + " ") or a in b:   # "lumen" ~ "lumen ai photo editor"
        r = max(r, 0.85 if b.startswith(a) else 0.75)
    return round(r, 3)


def reg_path(root):
    return Path(root) / "_registry" / "apps.json"


def load_reg(root):
    p = reg_path(root)
    if p.exists():
        return json.loads(p.read_text())
    return {"version": 1, "figmaHome": None, "publishers": [], "apps": []}


def save_reg(root, reg):
    p = reg_path(root)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(reg, ensure_ascii=False, indent=2))


def cmd_find(a):
    reg = load_reg(a.root)
    hits = []
    for app in reg["apps"]:
        keys = [app["name"], app.get("code", "")] + app.get("aliases", [])
        s = max(score(a.name, k) for k in keys if k)
        if norm(a.name) == norm(app.get("code", "")):
            s = 1.0
        if s >= 0.75:
            hits.append({**app, "_score": s})
    hits.sort(key=lambda h: -h["_score"])
    print(json.dumps({"inRegistry": bool(hits), "matches": hits[:3], "figmaHome": reg.get("figmaHome"),
                      "publishers": reg.get("publishers", [])}, ensure_ascii=False, indent=2))


def get_json(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def cmd_store(a):
    reg = load_reg(a.root)
    pubs = {norm(p) for p in reg.get("publishers", [])}
    q = urllib.parse.urlencode({"term": a.name, "country": a.country, "entity": "software", "limit": 25})
    try:
        res = get_json(f"{API}/search?{q}")["results"]
    except Exception as e:  # the network may be off (Claude Desktop environment)
        print(json.dumps({"error": f"Could not reach the App Store: {e}", "fallback": "WebSearch: '<name> app store' and read the apps.apple.com page with WebFetch"}, ensure_ascii=False))
        sys.exit(2)
    cands = []
    for r in res:
        s = score(a.name, r["trackName"])
        own = norm(r.get("sellerName", "")) in pubs or norm(r.get("artistName", "")) in pubs
        cands.append({"id": r["trackId"], "name": r["trackName"], "publisher": r.get("sellerName") or r.get("artistName"),
                      "ownPublisher": own, "rating": round(r.get("averageUserRating", 0), 1),
                      "ratingCount": r.get("userRatingCount", 0), "category": r.get("primaryGenreName"),
                      "releaseDate": (r.get("releaseDate") or "")[:10], "icon": r.get("artworkUrl512") or r.get("artworkUrl100"),
                      "link": r.get("trackViewUrl", "").split("?")[0], "bundleId": r.get("bundleId"),
                      "screenshotCount": len(r.get("screenshotUrls", [])), "_score": s})
    # own publisher first, then name similarity, then popularity
    cands.sort(key=lambda c: (not c["ownPublisher"], -c["_score"], -c["ratingCount"]))
    print(json.dumps({"query": a.name, "country": a.country, "candidates": cands[:a.n]}, ensure_ascii=False, indent=2))


def cmd_confirm(a):
    reg = load_reg(a.root)
    look = get_json(f"{API}/lookup?{urllib.parse.urlencode({'id': a.store_id, 'country': a.country})}")["results"]
    if not look:
        sys.exit(f"{a.store_id} not found on the App Store ({a.country})")
    r = look[0]
    figma = []
    for f in a.figma or []:
        name, _, url = f.partition("=")
        figma.append({"name": name.strip(), "link": url.strip()})
    entry = next((x for x in reg["apps"] if x.get("code") == a.code or x["name"] == a.name), None)
    if entry is None:
        entry = {"name": a.name}
        reg["apps"].append(entry)
    entry.update({"name": a.name, "code": a.code, "aliases": sorted(set(entry.get("aliases", []) + (a.alias or []) + [r["trackName"]]) - {a.name}),
                  "appStore": {"id": r["trackId"], "name": r["trackName"], "publisher": r.get("sellerName"), "link": r.get("trackViewUrl", "").split("?")[0],
                               "bundleId": r.get("bundleId"), "icon": r.get("artworkUrl512"), "country": a.country},
                  "confirmedOn": date.today().isoformat()})
    if figma:
        old = {x["link"]: x for x in entry.get("figma", [])}
        for f in figma:
            old[f["link"]] = f
        entry["figma"] = list(old.values())
    if a.library:
        entry["figmaLibrary"] = a.library
    seller = r.get("sellerName")
    if seller and seller not in reg["publishers"]:
        reg["publishers"].append(seller)
    save_reg(a.root, reg)

    # store info and the current set: for reference + measuring the brand color
    d = Path(a.root) / a.name / "_app"
    d.mkdir(parents=True, exist_ok=True)
    (d / f"store_{a.country}.json").write_text(json.dumps({k: r.get(k) for k in ("trackId", "trackName", "sellerName", "bundleId", "description",
        "averageUserRating", "userRatingCount", "primaryGenreName", "version", "currentVersionReleaseDate", "trackViewUrl", "screenshotUrls")},
        ensure_ascii=False, indent=2))
    got = 0
    for i, u in enumerate([r.get("artworkUrl512")] + r.get("screenshotUrls", [])):
        if not u:
            continue
        base = d / ("icon" if i == 0 else f"current_{a.country}_{i:02d}")
        sizes = ["1320x2868bb.png", "1290x2796bb.png", "1242x2688bb.png"] if i else []
        for url in [re.sub(r"/[^/]+$", "/" + sz, u) for sz in sizes] + [u]:
            try:
                with urllib.request.urlopen(url, timeout=30) as resp:
                    data = resp.read()
                ext = ".png" if data[:4] == b"\x89PNG" else ".jpg"
                base.with_suffix(ext).write_bytes(data)
                got += 1
                break
            except Exception:
                pass
    print(json.dumps({"saved": entry, "registry": str(reg_path(a.root)), "downloaded": got, "folder": str(d)}, ensure_ascii=False, indent=2))


def cmd_figma_home(a):
    reg = load_reg(a.root)
    if a.set:
        m = re.search(r"figma\.com/(?:design|file)/([0-9A-Za-z]{22,128})", a.set)
        if not m:
            sys.exit("Could not parse the Figma file link (figma.com/design/<KEY>/...)")
        reg["figmaHome"] = {"link": a.set, "fileKey": m.group(1)}
        save_reg(a.root, reg)
    print(json.dumps({"figmaHome": reg.get("figmaHome")}, ensure_ascii=False))


ap = argparse.ArgumentParser()
sub = ap.add_subparsers(dest="cmd", required=True)
s = sub.add_parser("find"); s.add_argument("name"); s.add_argument("--root", required=True); s.set_defaults(fn=cmd_find)
s = sub.add_parser("store"); s.add_argument("name"); s.add_argument("--root", required=True); s.add_argument("--country", default="us"); s.add_argument("-n", type=int, default=6); s.set_defaults(fn=cmd_store)
s = sub.add_parser("confirm"); s.add_argument("--root", required=True); s.add_argument("--name", required=True); s.add_argument("--code", required=True)
s.add_argument("--store-id", required=True); s.add_argument("--country", default="us"); s.add_argument("--figma", action="append")
s.add_argument("--alias", action="append"); s.add_argument("--library"); s.set_defaults(fn=cmd_confirm)
s = sub.add_parser("figma-home"); s.add_argument("--root", required=True); s.add_argument("--set"); s.set_defaults(fn=cmd_figma_home)
a = ap.parse_args()
a.fn(a)
