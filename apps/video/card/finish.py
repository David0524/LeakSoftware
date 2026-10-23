"""Joins a render's two halves (card/render.mjs) and makes the deliverables:

    out/card-<side>-ultra.png   the trimmed 6 x 8 card at the render's scale (7200 x 9600 at 4x)
    out/card-<side>-bleed.png   with its 0.125 in bleed
    out/card-<side>-share.jpg   1800 x 2400, for texting
    out/card-<side>-print.pdf   6.25 x 8.25 in with bleed, at 600 per inch

    python3 card/finish.py front
"""

import sys

from PIL import Image

Image.MAX_IMAGE_PIXELS = None
side = sys.argv[1] if len(sys.argv) > 1 else "front"
a = Image.open(f"out/card-{side}-half1.png").convert("RGB")
b = Image.open(f"out/card-{side}-half2.png").convert("RGB")
scale = a.width / 1875
half = round(1237.5 * scale)
bleed = Image.new("RGB", (a.width, 2 * half))
bleed.paste(a.crop((0, 0, a.width, half)), (0, 0))
bleed.paste(b.crop((0, 0, b.width, half)), (0, half))
bleed.save(f"out/card-{side}-bleed.png")
m = round(37.5 * scale)
ultra = bleed.crop((m, m, m + round(1800 * scale), m + round(2400 * scale)))
ultra.save(f"out/card-{side}-ultra.png")
ultra.resize((1800, 2400), Image.LANCZOS).save(f"out/card-{side}-share.jpg", quality=90)
bleed.resize((3750, 4950), Image.LANCZOS).save(f"out/card-{side}-print.pdf", resolution=600)
print(f"out/card-{side}: ultra {ultra.size[0]} x {ultra.size[1]}, share, bleed, print PDF")
