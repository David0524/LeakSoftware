"""Print PDF from the rendered bleed PNG: 6.25 x 8.25 in (6 x 8 trim + 0.125 in bleed)."""
import sys
from PIL import Image

side = sys.argv[1] if len(sys.argv) > 1 else "front"
im = Image.open(f"out/card-{side}-bleed.png").convert("RGB")
dpi = im.width / 6.25
im.save(f"out/card-{side}-print.pdf", resolution=dpi)
print(f"out/card-{side}-print.pdf", im.size, round(dpi))
