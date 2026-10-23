"""The laminate card's background: deep pool water at night-blue, its caustic light network,
and sun glints sparkling on the surface. Deterministic (fixed seed), so a re-render matches.

    python3 card/background.py out.png WIDTH HEIGHT
"""

import sys

import numpy as np
from PIL import Image, ImageFilter

out, W, H = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
rng = np.random.default_rng(7)
s = W / 1875  # design units: the card with bleed is 1875 x 2500

y, x = np.mgrid[0:H, 0:W].astype(np.float32)
u, v = x / W, y / H

# Base: navy at the top and bottom, a lift of water blue through the middle, a little brighter
# behind the hero (upper middle).
navy = np.array([0x16, 0x34, 0x55], np.float32) / 255
deep = np.array([0x10, 0x26, 0x40], np.float32) / 255
water = np.array([0x1F, 0x6F, 0xAE], np.float32) / 255
glow = np.exp(-(((u - 0.55) / 0.65) ** 2 + ((v - 0.42) / 0.40) ** 2))
low = np.clip((v - 0.62) / 0.38, 0, 1)
img = navy[None, None] * (1 - low[..., None] * 0.4) + deep[None, None] * (low[..., None] * 0.4)
img = img + (water - navy)[None, None] * (glow[..., None] * 0.85)

# Caustics: the bright net light makes through rippled water (sum of warped waves, thin ridges).
k = 2 * np.pi / (220 * s)
f = np.zeros((H, W), np.float32)
for i in range(5):
    a = rng.uniform(0, np.pi)
    ph = rng.uniform(0, 2 * np.pi)
    warp = 40 * s * np.sin(k * 0.7 * (x * np.sin(a + 1) + y * np.cos(a + 1)) + ph)
    f += np.sin(k * (x * np.cos(a) + y * np.sin(a)) + warp / (40 * s) * 1.6 + ph)
f /= 5
ridges = np.exp(-((f - 0.0) ** 2) / 0.006)  # thin bright lines where the waves cancel
ridge_mask = (0.35 + 0.65 * glow) * (1 - 0.6 * low)
img += np.array([0.35, 0.65, 0.95], np.float32)[None, None] * (ridges * ridge_mask * 0.055)[..., None]

base = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
base = base.filter(ImageFilter.GaussianBlur(1.2 * s))
acc = np.asarray(base).astype(np.float32) / 255

# Glitter: sun glints, many tiny and a few with four-point star flares, densest in the glow band.
glint = np.zeros((H, W), np.float32)
n = int(1400 * (W * H) / (1875 * 2500))
gx = rng.uniform(0, W, n)
gy = rng.uniform(0, H, n)
keep = rng.uniform(0, 1, n) < (0.25 + 0.75 * np.exp(-(((gy / H) - 0.45) / 0.33) ** 2))
gx, gy = gx[keep], gy[keep]
for cx, cy in zip(gx, gy):
    r = rng.choice([1.2, 1.6, 2.2, 3.0], p=[0.5, 0.28, 0.15, 0.07]) * s
    b = rng.uniform(0.35, 1.0)
    x0, x1 = int(max(cx - 8 * r, 0)), int(min(cx + 8 * r, W))
    y0, y1 = int(max(cy - 8 * r, 0)), int(min(cy + 8 * r, H))
    if x1 <= x0 or y1 <= y0:
        continue
    dx = x[y0:y1, x0:x1] - cx
    dy = y[y0:y1, x0:x1] - cy
    glint[y0:y1, x0:x1] += b * np.exp(-(dx**2 + dy**2) / (r * r))
# Star flares on the brightest few.
for cx, cy in zip(gx[:: max(1, len(gx) // 40)], gy[:: max(1, len(gy) // 40)]):
    L = rng.uniform(18, 46) * s
    b = rng.uniform(0.5, 0.9)
    x0, x1 = int(max(cx - L, 0)), int(min(cx + L, W))
    y0, y1 = int(max(cy - L, 0)), int(min(cy + L, H))
    dx = x[y0:y1, x0:x1] - cx
    dy = y[y0:y1, x0:x1] - cy
    w = 1.1 * s
    arm = np.exp(-(dy**2) / (w * w)) * np.exp(-np.abs(dx) / (L * 0.35))
    arm += np.exp(-(dx**2) / (w * w)) * np.exp(-np.abs(dy) / (L * 0.35))
    core = np.exp(-(dx**2 + dy**2) / ((3.2 * s) ** 2)) * 1.4
    glint[y0:y1, x0:x1] += b * (arm * 0.8 + core)
glow_img = Image.fromarray((np.clip(glint, 0, 4) / 4 * 255).astype(np.uint8))
halo = np.asarray(glow_img.filter(ImageFilter.GaussianBlur(6 * s))).astype(np.float32) / 255
tint = np.array([1.0, 0.97, 0.90], np.float32)  # warm sun on the glints
acc = acc + (np.clip(glint, 0, 1.5)[..., None] * 0.85 + halo[..., None] * 1.6) * tint[None, None]

# Soft bokeh: a few out-of-focus disks of light.
bok = np.zeros((H, W), np.float32)
for _ in range(28):
    cx, cy = rng.uniform(0, W), rng.uniform(0.1 * H, 0.8 * H)
    r = rng.uniform(10, 34) * s
    d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    bok += np.clip((r - d) / (1.5 * s), 0, 1) * rng.uniform(0.04, 0.09)
acc += bok[..., None] * np.array([0.55, 0.8, 1.0], np.float32)[None, None]

Image.fromarray((np.clip(acc, 0, 1) * 255).astype(np.uint8)).save(out, quality=95)
print(out, W, H)
