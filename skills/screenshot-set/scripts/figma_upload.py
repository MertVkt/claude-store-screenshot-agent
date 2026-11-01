#!/usr/bin/env python3
"""figma_upload.py : fills the image placeholders created by use_figma with the real images.

Flow:
  1. use_figma (build/localize JS) -> save the returned JSON:   Work/figma/build_en-US.result.json
  2. upload_assets(fileKey, count=N, nodeIds=[uploads[].nodeId in order], scaleMode="FILL")
     -> save the response exactly as returned:                 Work/figma/build_en-US.urls.json
  3. python figma_upload.py Work/figma/build_en-US.result.json Work/figma/build_en-US.urls.json

With more than 60 images, upload_assets is called several times (at most 60 nodeIds each, in order);
save the responses to separate files and pass them in the same order: ... result.json urls_1.json urls_2.json

Matching uses targetNodeId first, otherwise order. Images over 9.5 MB or in unsupported formats
are shrunk/converted with Pillow (Figma limit is 10 MB per image).
"""
import io, json, mimetypes, sys, urllib.request, urllib.error
from pathlib import Path

LIMIT = 9_500_000
OK_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


def find_upload_entries(obj):
    """Extracts a list of {url, target} from the upload_assets response (robust to shape changes)."""
    found = []

    def walk(o):
        if isinstance(o, dict):
            url = next((v for k, v in o.items() if isinstance(v, str) and v.startswith("http")
                        and "url" in k.lower() and "commit" not in k.lower()), None)
            if url:
                found.append({"url": url, "target": o.get("targetNodeId") or o.get("nodeId")})
            for v in o.values():
                if not isinstance(v, str) or v.strip()[:1] in "[{":
                    walk(v)
        elif isinstance(o, list):
            for v in o:
                if isinstance(v, str) and v.startswith("http"):
                    found.append({"url": v, "target": None})
                else:
                    walk(v)
        elif isinstance(o, str):
            s = o.strip()
            if s[:1] in "[{":
                try:
                    walk(json.loads(s))
                except json.JSONDecodeError:
                    pass

    walk(obj)
    return [f for f in found if "commit" not in f["url"].lower()]


def payload(path: Path):
    data = path.read_bytes()
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    if len(data) <= LIMIT and mime in OK_TYPES:
        return data, mime
    from PIL import Image  # only when needed
    im = Image.open(path)
    has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    scale = 1.0
    while True:
        cur = im if scale == 1.0 else im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
        buf = io.BytesIO()
        if has_alpha:
            cur.save(buf, "PNG", optimize=True)
            mime = "image/png"
        else:
            cur.convert("RGB").save(buf, "JPEG", quality=92, optimize=True)
            mime = "image/jpeg"
        if buf.tell() <= LIMIT or scale < 0.3:
            print(f"   converted: {path.name} -> {mime} {buf.tell()/1e6:.1f} MB (scale {scale:.2f})")
            return buf.getvalue(), mime
        scale *= 0.85


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    result = json.loads(Path(sys.argv[1]).read_text())
    if isinstance(result, dict) and "uploads" not in result:
        result = next((v for v in result.values() if isinstance(v, dict) and "uploads" in v), result)
    uploads = result.get("uploads", [])
    entries = [e for f in sys.argv[2:] for e in find_upload_entries(json.loads(Path(f).read_text()))]
    if not uploads:
        sys.exit("no 'uploads' in the result file")
    if len(entries) != len(uploads):
        sys.exit(f"Count mismatch: {len(uploads)} placeholders, {len(entries)} upload URLs. Call upload_assets with count={len(uploads)}.")

    by_target = {e["target"]: e for e in entries if e["target"]}
    pairs = []
    for i, u in enumerate(uploads):
        e = by_target.get(u["nodeId"]) or by_target.get(u["nodeId"].replace(":", "-")) or (entries[i] if not by_target else None)
        if not e:
            sys.exit(f"No URL found for {u['nodeId']}")
        pairs.append((u, e["url"]))

    fails = 0
    for u, url in pairs:
        data, mime = payload(Path(u["file"]))
        req = urllib.request.Request(url, data=data, method="POST", headers={"Content-Type": mime})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                print(f"OK   {u['nodeId']:>9} {u.get('name','')}  <- {Path(u['file']).name} ({len(data)/1e6:.1f} MB, HTTP {r.status})")
        except urllib.error.HTTPError as e:
            fails += 1
            print(f"FAIL {u['nodeId']:>9} {Path(u['file']).name}: HTTP {e.code} {e.read()[:200]!r}")
    print(f"{len(pairs) - fails}/{len(pairs)} images uploaded.")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
