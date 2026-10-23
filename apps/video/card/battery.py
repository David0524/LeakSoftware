"""The owner's Lock Screen with a full battery: the yellow Low Power "77" is painted out and
iOS's 100% battery (a full white body with "100" cut out of it, and its nub) is drawn in.

    python3 battery.py   (screens/lock-screen-owner.png -> screens/lock-screen.png)
"""

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

src = cv2.imread("screens/lock-screen-owner.png")
# The battery: body x 1105-1189, y 73-119; nub to x 1198.
mask = np.zeros(src.shape[:2], np.uint8)
mask[69:124, 1100:1203] = 255
clean = cv2.inpaint(src, mask, 9, cv2.INPAINT_TELEA)
im = Image.fromarray(cv2.cvtColor(clean, cv2.COLOR_BGR2RGB))

# Drawn at 4x, then scaled down, so the edges are smooth like the system's.
S = 4
x0, y0, w, h = 1105, 73, 84, 46
layer = Image.new("L", (w * S + 16 * S, h * S), 0)
d = ImageDraw.Draw(layer)
d.rounded_rectangle((0, 0, w * S - 1, h * S - 1), radius=14 * S, fill=255)
d.rounded_rectangle((w * S + 3 * S, 15 * S, w * S + 9 * S, h * S - 15 * S), radius=3 * S, fill=150)
font = ImageFont.truetype("/usr/share/fonts/opentype/inter/Inter-Bold.otf", 33 * S)
tb = d.textbbox((0, 0), "100", font=font)
tx = (w * S - (tb[2] - tb[0])) / 2 - tb[0]
ty = (h * S - (tb[3] - tb[1])) / 2 - tb[1]
d.text((tx, ty), "100", font=font, fill=0)
layer = layer.resize((w + 16, h), Image.LANCZOS)
white = Image.new("RGB", layer.size, (255, 255, 255))
im.paste(white, (x0, y0), layer)
im.save("screens/lock-screen.png")
im.crop((900, 30, 1300, 200)).resize((1200, 510), Image.LANCZOS).save("/tmp/batt-check.png")
print("screens/lock-screen.png")
