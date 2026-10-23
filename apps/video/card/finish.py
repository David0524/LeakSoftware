"""From a scale-4 render: the share JPEG (1800 x 2400, for texting) and the print PDF
(6.25 x 8.25 in: the 6 x 8 card with 0.125 in bleed, at 600 per inch).

    python3 card/finish.py front
"""

import sys

from PIL import Image

Image.MAX_IMAGE_PIXELS = None
side = sys.argv[1] if len(sys.argv) > 1 else "front"
ultra = Image.open(f"out/card-{side}-ultra.png").convert("RGB")
ultra.resize((1800, 2400), Image.LANCZOS).save(f"out/card-{side}-share.jpg", quality=90)
bleed = Image.open(f"out/card-{side}-bleed.png").convert("RGB")
bleed.resize((3750, 5000), Image.LANCZOS).save(f"out/card-{side}-print.pdf", resolution=600)
print(f"out/card-{side}-share.jpg, out/card-{side}-print.pdf ({ultra.size[0]} x {ultra.size[1]} ultra)")
