#!/usr/bin/env python3
"""store_refs.py : downloads competitors' App Store screenshots (Apple's public iTunes API, no key needed).

  python store_refs.py search "photo editor" --country us -n 8         # search ranking + id list
  python store_refs.py get 1234567890 --country us -o Ref.Shots/       # one app (id or App Store link)
  python store_refs.py get 1234567890 987654321 --country tr -o Ref.Shots/

Downloads: Ref.Shots/<app-name>/<country>_iphone_01.png ... + meta.json (name, developer, rating, description).
Note: the API returns small-size URLs; a larger size is requested at the end of the path, falling back to the original.
Change the country to see the competitor's localized set too (--country de, jp ...).
"""
import argparse, json, re, sys, urllib.parse, urllib.request
from pathlib import Path

API = "https://itunes.apple.com"


def get_json(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40] or "app"


def hires(url, w, h):
    return re.sub(r"/[^/]+$", f"/{w}x{h}bb.png", url)


def download(url, dest):
    try:
        urllib.request.urlretrieve(url, dest)
        return True
    except Exception:
        return False


def app_id(s):
    m = re.search(r"id(\d{6,})", s)
    return m.group(1) if m else s


def cmd_search(a):
    q = urllib.parse.urlencode({"term": a.term, "country": a.country, "entity": "software", "limit": a.n})
    for i, r in enumerate(get_json(f"{API}/search?{q}")["results"], 1):
        print(f"{i:2}. {r['trackId']}  {r['trackName'][:45]:45}  {r.get('averageUserRating', 0):.1f}*  {r.get('userRatingCount', 0):>8} ratings  {len(r.get('screenshotUrls', []))} images")


def cmd_get(a):
    out = Path(a.o)
    for raw in a.ids:
        res = get_json(f"{API}/lookup?{urllib.parse.urlencode({'id': app_id(raw), 'country': a.country})}")["results"]
        if not res:
            print(f"not found: {raw} ({a.country})")
            continue
        r = res[0]
        d = out / slug(r["trackName"])
        d.mkdir(parents=True, exist_ok=True)
        meta = {k: r.get(k) for k in ("trackId", "trackName", "sellerName", "averageUserRating", "userRatingCount", "primaryGenreName", "description", "trackViewUrl")}
        (d / f"meta_{a.country}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2))
        n = 0
        for kind, urls, size in (("iphone", r.get("screenshotUrls", []), (1320, 2868)), ("ipad", r.get("ipadScreenshotUrls", []), (2064, 2752))):
            for i, u in enumerate(urls, 1):
                dest = d / f"{a.country}_{kind}_{i:02d}.png"
                if not download(hires(u, *size), dest):
                    dest = dest.with_suffix(Path(u).suffix or ".jpg")
                    download(u, dest)
                n += 1
        print(f"{r['trackName']}: {n} images -> {d}")


ap = argparse.ArgumentParser()
sub = ap.add_subparsers(dest="cmd", required=True)
s = sub.add_parser("search"); s.add_argument("term"); s.add_argument("--country", default="us"); s.add_argument("-n", type=int, default=10); s.set_defaults(fn=cmd_search)
s = sub.add_parser("get"); s.add_argument("ids", nargs="+"); s.add_argument("--country", default="us"); s.add_argument("-o", default="Ref.Shots"); s.set_defaults(fn=cmd_get)
a = ap.parse_args()
a.fn(a)
