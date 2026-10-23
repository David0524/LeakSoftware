"""Draws Rebecca Quinn's saved signature into the iPhone app's Customer Signs screen.

    python3 tools/sign_screen.py captures/iphone/lv-signed.png

The app draws a saved signature with SwiftUI's Canvas, which the simulator's off-screen capture
leaves blank. This draws the same strokes (assets/owner/rebecca-signature.svg, the exact SVG the
app saved) the way ReportTab.SignatureImage does: aspect-fit into the 80-point box above the
signer's name, centered, stroked in white 0.07 at max(1.5, 3 × scale) points, round caps.
"""

import os
import re
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SVG = os.path.join(ROOT, "assets", "owner", "rebecca-signature.svg")
PX = 3  # screenshot pixels per point
# The signature box in the screenshot: the card's content width, 80 points tall, at the top of
# the Signatures card (16-point padding).
BOX = (96, 1316, 1082, 1316 + 80 * PX)


def strokes(svg):
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', svg).group(1).split()]
    paths = []
    for d in re.findall(r'<path d="([^"]+)"', svg):
        nums = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", d)]
        paths.append(list(zip(nums[0::2], nums[1::2])))
    return vb, paths


def main(path):
    with open(SVG) as f:
        vb, paths = strokes(f.read())
    im = Image.open(path).convert("RGB")
    x0, y0, x1, y1 = BOX
    w, h = (x1 - x0) / PX, (y1 - y0) / PX  # points
    scale = min(w / vb[2], h / vb[3])
    dx = (w - vb[2] * scale) / 2 - vb[0] * scale
    dy = (h - vb[3] * scale) / 2 - vb[1] * scale
    width = max(1.5, 3 * scale) * PX
    # Drawn at 4× and scaled down, for smooth edges.
    ss = 4
    layer = Image.new("L", ((x1 - x0) * ss, (y1 - y0) * ss), 0)
    draw = ImageDraw.Draw(layer)
    r = width * ss / 2
    for pts in paths:
        xy = [((px * scale + dx) * PX * ss, (py * scale + dy) * PX * ss) for px, py in pts]
        draw.line(xy, fill=255, width=round(width * ss), joint="curve")
        for x, y in (xy[0], xy[-1]):
            draw.ellipse((x - r, y - r, x + r, y + r), fill=255)
    mask = layer.resize((x1 - x0, y1 - y0), Image.LANCZOS)
    ink = Image.new("RGB", mask.size, (18, 18, 18))
    im.paste(ink, (x0, y0), mask)
    im.save(path)
    print(f"Signed {os.path.relpath(path, ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1])
