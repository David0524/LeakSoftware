"""Finishes the stills rendered by stills.py: joins the strips rendered in parallel, adds the
dot's bloom (a soft glow around the brightest light, as a lens shows it, and as the clip's
compositor glare adds it), and writes:

  <view>.png        RGBA, transparent background, straight alpha, 8 bit
  <view>-navy.jpg   on the brand navy (tokens.json color.brand.navy)
  <view>-white.jpg  on white

Blender's glare can't add light where the film is transparent, so the bloom is added here,
in premultiplied colour, with its own coverage: on a transparent background the glow is a
soft orange haze that shows on both dark and light backgrounds.

    python3 post.py IN_DIR OUT_DIR VIEW [VIEW ...]

(.github/workflows/logo-stills.yml runs it after the parallel renders.)
"""

import glob
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
TOKENS = json.load(open(os.path.join(ROOT, "brand", "tokens.json")))
NAVY = TOKENS["color"]["brand"]["navy"]


def hex_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)


def load(path):
    im = Image.open(path)
    a = np.asarray(im).astype(np.float32)
    return a / (65535.0 if a.max() > 255 else 255.0)


def join(in_dir, view):
    """The view's image: the whole one, or the sum of its strips (each is transparent outside
    its own rows, so adding them in premultiplied colour joins them)."""
    whole = os.path.join(in_dir, f"{view}.png")
    if os.path.exists(whole):
        a = load(whole)
        a[..., :3] *= a[..., 3:4]
        return a
    strips = sorted(glob.glob(os.path.join(in_dir, f"{view}-s*.png")))
    assert strips, f"no render for {view} in {in_dir}"
    acc = None
    for p in strips:
        a = load(p)
        a[..., :3] *= a[..., 3:4]
        acc = a if acc is None else acc + a
    return np.clip(acc, 0, 1)


def blur(arr, radius):
    """Gaussian blur of a float image, channel by channel."""
    out = np.empty_like(arr)
    for c in range(arr.shape[2]):
        ch = Image.fromarray((np.clip(arr[..., c], 0, 1) * 255).astype(np.uint8))
        out[..., c] = np.asarray(ch.filter(ImageFilter.GaussianBlur(radius))).astype(np.float32) / 255
    return out


def bloom(pm):
    """Bloom from the brightest, most saturated light (the dot and its halo): what's above the
    threshold, blurred at three widths, scaled to the image."""
    rgb = pm[..., :3]
    lum = rgb.max(axis=2, keepdims=True)
    bright = np.clip((lum - 0.62) / 0.38, 0, 1) * rgb
    h = pm.shape[0]
    glow = 0.55 * blur(bright, h * 0.004) + 0.45 * blur(bright, h * 0.014) + 0.5 * blur(bright, h * 0.04)
    return glow


def finish(in_dir, out_dir, view):
    pm = join(in_dir, view)
    g = bloom(pm)
    rgb = pm[..., :3] + g * (1 - pm[..., 3:4] * 0.35)
    # The glow's own coverage, so it shows as light on a transparent background.
    ga = np.clip(g.max(axis=2, keepdims=True) * 1.15, 0, 1)
    alpha = np.clip(pm[..., 3:4] + ga * (1 - pm[..., 3:4]), 0, 1)
    rgb = np.clip(rgb, 0, None)
    # Keep premultiplied colour within its coverage.
    rgb = np.minimum(rgb, alpha)
    straight = np.where(alpha > 1e-4, rgb / np.maximum(alpha, 1e-4), 0)
    rgba = np.concatenate([straight, alpha], axis=2)
    os.makedirs(out_dir, exist_ok=True)
    Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(
        os.path.join(out_dir, f"{view}.png"), optimize=True)
    for name, bg in (("navy", hex_rgb(NAVY)), ("white", np.ones(3, np.float32))):
        over = rgb + bg * (1 - alpha)
        Image.fromarray((np.clip(over, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB").save(
            os.path.join(out_dir, f"{view}-{name}.jpg"), quality=92, subsampling=0)
    print(f"{view}: {pm.shape[1]} x {pm.shape[0]}")


if __name__ == "__main__":
    in_dir, out_dir, *views = sys.argv[1:]
    for v in views:
        finish(in_dir, out_dir, v)
