#!/usr/bin/env python3
"""imgtools.py : small measuring tools for reference and delivery images (Pillow).

  python imgtools.py sheet Ref.Shots/competitor/*.jpg -o Work/ref_sheet.png [--labels] [--h 700]
      labeled side-by-side contact sheet (to let the user pick, to see references at a glance)
  python imgtools.py palette Ref.Shots/competitor/01.jpg [-n 6]
      dominant colors, hex and share (to take colors by measuring, not by eye)
  python imgtools.py info Final/**/*.png
      size, mode (alpha or not), color profile, MB
  python imgtools.py pick Ref.Shots/competitor/01.jpg 120,340 [660,90 ...]
      hex value of the given pixels
"""
import argparse, glob, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def font(size):
    for f in ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Helvetica.ttc",
              "/usr/share/fonts/opentype/inter/Inter-Bold.otf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def expand(paths):
    out = []
    for p in paths:
        out += sorted(glob.glob(p, recursive=True)) or [p]
    return [p for p in out if Path(p).is_file()]


def sheet(a):
    files = expand(a.files)
    ims = [Image.open(f).convert("RGB") for f in files]
    th, gap, lab = a.h, 24, 60 if a.labels else 0
    thumbs = [im.resize((round(im.width * th / im.height), th), Image.LANCZOS) for im in ims]
    W = sum(t.width for t in thumbs) + gap * (len(thumbs) + 1)
    canvas = Image.new("RGB", (W, th + 2 * gap + lab), (28, 28, 31))
    d, x, f = ImageDraw.Draw(canvas), gap, font(34)
    for i, (t, p) in enumerate(zip(thumbs, files)):
        canvas.paste(t, (x, gap))
        if a.labels:
            d.text((x, th + gap + 12), f"{i + 1}  {Path(p).stem[:28]}", fill=(220, 220, 225), font=f)
        x += t.width + gap
    canvas.save(a.o)
    print(f"{len(files)} images -> {a.o} ({canvas.width}x{canvas.height})")


def palette(a):
    im = Image.open(a.file).convert("RGB")
    im.thumbnail((400, 400))
    q = im.quantize(colors=a.n, method=Image.Quantize.MEDIANCUT)
    pal, counts = q.getpalette(), sorted(q.getcolors(), reverse=True)
    total = sum(c for c, _ in counts)
    for c, idx in counts:
        r, g, b = pal[idx * 3: idx * 3 + 3]
        print(f"#{r:02X}{g:02X}{b:02X}  {100 * c / total:5.1f}%")


def info(a):
    for p in expand(a.files):
        im = Image.open(p)
        icc = im.info.get("icc_profile") or b""
        prof = "Display P3" if b"Display P3" in icc else "sRGB" if b"sRGB" in icc else ("other" if icc else "none")
        alpha = "ALPHA" if im.mode in ("RGBA", "LA", "PA") or "transparency" in im.info else "-"
        print(f"{im.width}x{im.height}  {im.mode:5} {alpha:5} profile:{prof:10} {Path(p).stat().st_size / 1e6:5.2f} MB  {p}")


def pick(a):
    im = Image.open(a.file).convert("RGB")
    for xy in a.points:
        x, y = map(int, xy.split(","))
        r, g, b = im.getpixel((x, y))
        print(f"{x},{y}  #{r:02X}{g:02X}{b:02X}")


ap = argparse.ArgumentParser()
sub = ap.add_subparsers(dest="cmd", required=True)
s = sub.add_parser("sheet"); s.add_argument("files", nargs="+"); s.add_argument("-o", required=True); s.add_argument("--labels", action="store_true"); s.add_argument("--h", type=int, default=700); s.set_defaults(fn=sheet)
s = sub.add_parser("palette"); s.add_argument("file"); s.add_argument("-n", type=int, default=6); s.set_defaults(fn=palette)
s = sub.add_parser("info"); s.add_argument("files", nargs="+"); s.set_defaults(fn=info)
s = sub.add_parser("pick"); s.add_argument("file"); s.add_argument("points", nargs="+"); s.set_defaults(fn=pick)
a = ap.parse_args()
a.fn(a)
