#!/usr/bin/env python3
"""figma_export.py : turns the Figma frames (as edited by the designer) into delivery PNGs.

  python figma_export.py spec.json --file <fileKey>                 # pull from Figma REST + deliver
  python figma_export.py spec.json --file <fileKey> --locales tr
  python figma_export.py spec.json --raw-dir Work/export_raw        # PNGs already downloaded (get_screenshot etc.)

Pulling from Figma needs FIGMA_TOKEN (Figma > Settings > Security > Personal access tokens,
scope: file_content:read). It lives in ~/.config/store-screenshot-agent/.env.

What it does: finds frames by name, downloads 1x PNGs (Work/export_raw/<frame>.png), slices the panorama,
drops the alpha channel (App Store does not accept alpha), cover-scales to device sizes and writes
Final/<locale>/<device>/<CODE><SET>_<LANG>_<nn>_<Keyword>_<WxH>.png.
"""
import argparse, json, os, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request
from pathlib import Path
from PIL import Image

CANVAS = {"iphone-6.9": (1320, 2868), "ipad-13": (2064, 2752), "play-phone": (1080, 1920)}
TARGETS = {   # canvas -> {folder: (width, height)}; the first one is the master
    "iphone-6.9": {"iPhone-6.9": (1320, 2868), "iPhone-6.5": (1284, 2778), "iPhone-6.3": (1206, 2622)},
    "ipad-13": {"iPad-13": (2064, 2752)},
    "play-phone": {"Play-phone": (1080, 1920)},
}
KEEP_REGION = {"pt-BR", "pt-PT", "es-MX", "en-GB", "en-AU", "en-CA", "fr-CA", "zh-Hans", "zh-Hant"}
API = "https://api.figma.com/v1"


def lang_code(loc):
    return loc.upper() if loc in KEEP_REGION else loc.split("-")[0].upper()


def camel(text, n=4):
    t = unicodedata.normalize("NFKD", text.replace("*", "").replace("ı", "i").replace("İ", "I"))
    t = "".join(c for c in t if not unicodedata.combining(c))
    words = re.findall(r"[A-Za-z0-9]+", t)[:n]
    return "".join(w[:1].upper() + w[1:] for w in words) or "Shot"


def keyword(spec, shot):
    if shot.get("keyword"):
        return shot["keyword"]
    base = spec.get("baseLocale") or spec["locales"][0]
    for L in shot.get("layers", []):
        if L.get("type") == "text" and (L.get("role") == "headline" or L.get("id") == "headline"):
            t = L["text"]
            return camel(t.get(base, next(iter(t.values()))) if isinstance(t, dict) else t)
    return f"Shot{shot['id']}"


def boards(spec, loc):
    pre = f"{spec['code']}{spec['set']}"
    if spec.get("panorama"):
        return [(f"{pre}_{loc}_pano", spec["shots"])]
    return [(f"{pre}_{loc}_{s['id']}", [s]) for s in spec["shots"]]


def api_get(path, token):
    req = urllib.request.Request(f"{API}{path}", headers={"X-Figma-Token": token})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 4:
                wait = int(e.headers.get("Retry-After", "20"))
                print(f"   Figma rate limit, waiting {wait} s")
                time.sleep(wait)
                continue
            sys.exit(f"Figma API {e.code}: {e.read()[:300]!r}")


def fetch(spec, file_key, names, raw_dir):
    token = os.environ.get("FIGMA_TOKEN")
    if not token:
        sys.exit("FIGMA_TOKEN is missing. Add it to ~/.config/store-screenshot-agent/.env or pass the PNGs with --raw-dir.")
    page_name = f"{spec['code']} {spec['set']}"
    doc = api_get(f"/files/{file_key}?depth=2", token)["document"]
    page = next((p for p in doc["children"] if p["name"] == page_name), None)
    if not page:
        sys.exit(f"No '{page_name}' page in Figma. Pages: {[p['name'] for p in doc['children']]}")
    ids = {c["name"]: c["id"] for c in page.get("children", [])}
    missing = [n for n in names if n not in ids]
    if missing:
        sys.exit(f"Frames not found in Figma: {missing}")
    raw_dir.mkdir(parents=True, exist_ok=True)
    for i in range(0, len(names), 8):
        chunk = names[i:i + 8]
        q = urllib.parse.urlencode({"ids": ",".join(ids[n] for n in chunk), "format": "png", "scale": 1})
        urls = api_get(f"/images/{file_key}?{q}", token)["images"]
        for n in chunk:
            u = urls.get(ids[n])
            if not u:
                sys.exit(f"Figma returned no render for {n}")
            urllib.request.urlretrieve(u, raw_dir / f"{n}.png")
            print(f"   downloaded: {n}.png")


def cover(im, size):
    tw, th = size
    s = max(tw / im.width, th / im.height)
    r = im.resize((max(tw, round(im.width * s)), max(th, round(im.height * s))), Image.LANCZOS)
    x, y = (r.width - tw) // 2, (r.height - th) // 2
    return r.crop((x, y, x + tw, y + th))


def flatten(im, name):
    if im.mode in ("RGBA", "LA", "P"):
        rgba = im.convert("RGBA")
        lo = rgba.getchannel("A").getextrema()[0]
        if lo < 255:
            print(f"   WARNING {name}: transparent pixels found (min alpha {lo}), flattened onto black")
        bg = Image.new("RGB", rgba.size, (0, 0, 0))
        bg.paste(rgba, mask=rgba.getchannel("A"))
        return bg
    return im.convert("RGB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--file", help="Figma file key (figma.com/design/<KEY>/...)")
    ap.add_argument("--locales")
    ap.add_argument("--raw-dir")
    ap.add_argument("--out")
    ap.add_argument("--sizes", help="comma-separated folder names, e.g. iPhone-6.9,iPhone-6.3")
    a = ap.parse_args()

    spec_path = Path(a.spec).resolve()
    spec, root = json.loads(spec_path.read_text()), spec_path.parent
    locales = a.locales.split(",") if a.locales else spec["locales"]
    raw_dir = Path(a.raw_dir).resolve() if a.raw_dir else root / "Work/export_raw"
    out = Path(a.out).resolve() if a.out else root / "Final"
    W, H = CANVAS[spec["canvas"]]
    targets = TARGETS[spec["canvas"]]
    if a.sizes:
        targets = {k: v for k, v in targets.items() if k in a.sizes.split(",")}

    all_names = [n for loc in locales for n, _ in boards(spec, loc)]
    if a.file:
        fetch(spec, a.file, all_names, raw_dir)

    pre, rows = f"{spec['code']}{spec['set']}", []
    for loc in locales:
        idx = 0
        for name, shots in boards(spec, loc):
            src = raw_dir / f"{name}.png"
            if not src.exists():
                sys.exit(f"Raw PNG missing: {src}")
            im = Image.open(src)
            exp = (W * len(shots), H)
            if im.size != exp:
                sys.exit(f"{name}: got {im.size}, expected {exp}. The frame size may have changed in Figma.")
            im = flatten(im, name)
            for k, shot in enumerate(shots):
                idx += 1
                piece = im.crop((k * W, 0, (k + 1) * W, H))
                for folder, size in targets.items():
                    d = out / loc / folder
                    d.mkdir(parents=True, exist_ok=True)
                    f = d / f"{pre}_{lang_code(loc)}_{idx:02d}_{keyword(spec, shot)}_{size[0]}x{size[1]}.png"
                    (piece if size == (W, H) else cover(piece, size)).save(f, "PNG", optimize=True)
                    rows.append((loc, folder, f.name, f.stat().st_size))
    for loc, folder, fn, sz in rows:
        print(f"{loc:7} {folder:11} {fn}  {sz/1e6:.1f} MB")
    print(f"{len(rows)} files -> {out}\nNext step: python verify_shots.py {out}")


if __name__ == "__main__":
    main()
