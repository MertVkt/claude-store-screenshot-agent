#!/usr/bin/env python3
"""verify_shots.py : checks the delivery folder against store rules. Measure what you deliver, not what you generated.

  python verify_shots.py Final/
  python verify_shots.py Final/ --strict      # WARNs also fail the exit code

Expected layout: Final/<locale>/<device folder>/*.png|jpg  (figma_export.py writes this)
Checks: pixel size (allowed for the device class), alpha channel, count (1-10, Play 2-8),
equal count across locales, color profile, file size, file name pattern, images left
untranslated (identical across locales).
"""
import hashlib, re, sys
from collections import defaultdict
from pathlib import Path
from PIL import Image

ALLOWED = {   # App Store Connect screenshot specifications (checked October 2026)
    "iPhone-6.9": {(1320, 2868), (1290, 2796), (1260, 2736)},
    "iPhone-6.5": {(1284, 2778), (1242, 2688)},
    "iPhone-6.3": {(1206, 2622), (1179, 2556)},
    "iPad-13": {(2064, 2752), (2048, 2732)},
}
NAME = re.compile(r"^[A-Z0-9]+SS\d+_[A-Z]{2}(-[A-Z]{2,4})?_\d{2}_[A-Za-z0-9]+_\d+x\d+\.(png|jpe?g)$")


def play_ok(w, h):
    lo, hi = min(w, h), max(w, h)
    return 320 <= lo and hi <= 3840 and hi <= 2 * lo


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    root, strict = Path(sys.argv[1]), "--strict" in sys.argv
    issues, counts, hashes = [], defaultdict(dict), defaultdict(dict)

    def add(level, f, msg):
        issues.append((level, f, msg))

    files = sorted(p for p in root.glob("*/*/*") if p.suffix.lower() in (".png", ".jpg", ".jpeg"))
    if not files:
        sys.exit(f"No <locale>/<device>/*.png found under {root}")
    for f in files:
        loc, dev = f.parent.parent.name, f.parent.name
        rel = f.relative_to(root)
        counts[dev][loc] = counts[dev].get(loc, 0) + 1
        im = Image.open(f)
        w, h = im.size
        if dev in ALLOWED and (w, h) not in ALLOWED[dev]:
            add("ERROR", rel, f"{w}x{h} is not accepted for {dev} ({sorted(ALLOWED[dev])})")
        elif dev.startswith("Play") and not play_ok(w, h):
            add("ERROR", rel, f"{w}x{h} breaks Play rules (short side >= 320, long side <= 3840, ratio <= 2:1)")
        elif dev not in ALLOWED and not dev.startswith("Play"):
            add("WARN", rel, f"unknown device folder '{dev}', size not checked")
        if im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info):
            add("ERROR", rel, f"has an alpha channel ({im.mode}); App Store rejects it")
        icc = im.info.get("icc_profile")
        if icc and b"Display P3" not in icc and b"sRGB" not in icc:
            add("WARN", rel, "color profile is not sRGB/Display P3")
        mb = f.stat().st_size / 1e6
        if mb > 8:
            add("WARN" if dev in ALLOWED else "ERROR", rel, f"{mb:.1f} MB (Play limit is 8 MB; large for App Store too)")
        if not NAME.match(f.name):
            add("WARN", rel, "file name does not follow <CODE>SS<nn>_<LANG>_<order>_<Keyword>_<WxH>")
        idx = f.name.split("_")[2] if f.name.count("_") >= 4 else f.name
        hashes[(dev, idx)][loc] = hashlib.md5(f.read_bytes()).hexdigest()

    for dev, per in counts.items():
        lo, hi = (2, 8) if dev.startswith("Play") else (1, 10)
        for loc, n in per.items():
            if not lo <= n <= hi:
                add("ERROR", f"{loc}/{dev}", f"{n} images; allowed range {lo}-{hi}")
        if len(set(per.values())) > 1:
            add("WARN", dev, f"image count differs across locales: {dict(per)}")
    for (dev, idx), per in hashes.items():
        seen = defaultdict(list)
        for loc, hsh in per.items():
            seen[hsh].append(loc)
        for locs in seen.values():
            if len(locs) > 1:
                add("WARN", f"{dev} #{idx}", f"{', '.join(locs)} have the identical image: left untranslated?")

    for dev, per in sorted(counts.items()):
        print(f"{dev:11} " + "  ".join(f"{loc}:{n}" for loc, n in sorted(per.items())))
    for level, f, msg in issues:
        print(f"{level:5} {f}  {msg}")
    err = sum(1 for i in issues if i[0] == "ERROR") + (sum(1 for i in issues if i[0] == "WARN") if strict else 0)
    print(f"{len(files)} files, {sum(1 for i in issues if i[0]=='ERROR')} ERROR, {sum(1 for i in issues if i[0]=='WARN')} WARN")
    sys.exit(1 if err else 0)


if __name__ == "__main__":
    main()
