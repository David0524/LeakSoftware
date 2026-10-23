"""The card's route map: a zoomed-out Phoenix-style map (mile-grid arterials, freeways, a
canal, mountain preserves, city names) with Monday's three cleaning routes. Each tech's
stops sit in one part of town, visited nearest-first from the shop and driven along the
street grid, as an optimized day looks. Drawn into card/front.html between the map markers
(675 x 770, the page area the map fills)."""

import math
import random

W, H = 675, 770
rng = random.Random(11)
MILE = 64  # arterial spacing
HALF = MILE / 2
X0, Y0 = 18, 26  # grid offset

def snap(v, o, step):
    return o + round((v - o) / step) * step

shop = (snap(150, X0, MILE), snap(372, Y0, MILE))
techs = [
    ("#7B5CC4", (40, 140, 250, 330)),   # Marcus: north
    ("#1F6FAE", (12, 420, 120, 720)),   # Dana: west and south
    ("#D07B27", (150, 430, 300, 730)),  # Jake: southeast, partly under the phone
]

def stops_in(box):
    """Seven stops on the streets of one part of town, in the order a good route takes them:
    a sweep around the area, starting with the stop nearest the shop."""
    x0, y0, x1, y1 = box
    pts = []
    while len(pts) < 7:
        # On a north-south road (x on the half-mile grid), anywhere along it.
        p = (snap(rng.uniform(x0, x1), X0, HALF), snap(rng.uniform(y0, y1), Y0, HALF / 4))
        if all(math.dist(p, q) > 40 for q in pts):
            pts.append(p)
    cx = sum(p[0] for p in pts) / 7
    cy = sum(p[1] for p in pts) / 7
    ring = sorted(pts, key=lambda p: math.atan2(p[1] - cy, p[0] - cx))
    k = min(range(7), key=lambda i: math.dist(ring[i], shop))
    ring = ring[k:] + ring[:k]
    # Go round whichever way makes the shorter first leg pair.
    if math.dist(ring[0], ring[1]) > math.dist(ring[0], ring[-1]):
        ring = [ring[0]] + ring[1:][::-1]
    return ring

def drive(a, b):
    """From a to b on the street grid: along a's road to the east-west road nearest b, across,
    then along b's road to the stop."""
    ax, ay = a
    bx, by = b
    ry = snap((ay + by) / 2 if ax != bx else by, Y0, HALF)
    return [(ax, ry), (bx, ry), (bx, by)]

def rounded(pts, r=8):
    clean = [pts[0]]
    for p in pts[1:]:
        if math.dist(p, clean[-1]) > 0.5:
            clean.append(p)
    out = f"M{clean[0][0]:.1f} {clean[0][1]:.1f}"
    for i in range(1, len(clean) - 1):
        p0, p1, p2 = clean[i - 1], clean[i], clean[i + 1]
        d1, d2 = math.dist(p1, p0), math.dist(p1, p2)
        k = min(r, d1 / 2, d2 / 2)
        a = (p1[0] + (p0[0] - p1[0]) * k / d1, p1[1] + (p0[1] - p1[1]) * k / d1)
        b = (p1[0] + (p2[0] - p1[0]) * k / d2, p1[1] + (p2[1] - p1[1]) * k / d2)
        out += f" L{a[0]:.1f} {a[1]:.1f} Q{p1[0]:.1f} {p1[1]:.1f} {b[0]:.1f} {b[1]:.1f}"
    return out + f" L{clean[-1][0]:.1f} {clean[-1][1]:.1f}"

parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">']
parts.append(f'<rect width="{W}" height="{H}" fill="#F1EFE9"/>')
# Mountain preserves and parks.
parts.append('<path d="M228 150c40-30 90-10 120 20s70 30 90 70-20 80-60 90-70-20-100-40-90-40-80-80 10-50 30-60z" fill="#DCE8D0"/>')
parts.append('<path d="M470 420c50-20 110 10 150 50s20 100-30 110-90-20-120-50-50-90 0-110z" fill="#DCE8D0"/>')
parts.append('<path d="M-10 640c40-10 70 10 80 40s-20 60-50 70-40 0-40 0z" fill="#E3EBD5"/>')
# Local roads (half mile), then arterials (mile).
loc, art = [], []
x = X0
while x < W:
    (art if round((x - X0) / HALF) % 2 == 0 else loc).append(f"M{x:.0f} 0V{H}")
    x += HALF
y = Y0
while y < H:
    (art if round((y - Y0) / HALF) % 2 == 0 else loc).append(f"M0 {y:.0f}H{W}")
    y += HALF
parts.append(f'<path d="{" ".join(loc)}" stroke="#FFFFFF" stroke-width="2" opacity=".9"/>')
parts.append(f'<path d="{" ".join(art)}" stroke="#FFFFFF" stroke-width="5"/>')
# The canal, running across town on a diagonal.
parts.append('<path d="M-10 250C90 236 160 300 260 290S420 230 520 250 640 300 690 290" stroke="#A9D2EE" stroke-width="7" fill="none"/>')
# Freeways: casing then fill.
fw = [
    "M210 -10C206 120 214 260 210 400S200 640 206 790",  # I-17
    "M-10 70C120 60 260 64 420 58S600 40 690 60",          # Loop 101
    "M690 360C600 380 520 420 460 520S400 700 410 790",   # SR-51
    "M-10 560C140 552 300 548 470 560S620 600 690 610",   # I-10
]
for d in fw:
    parts.append(f'<path d="{d}" stroke="#E2A93B" stroke-width="11" fill="none"/>')
for d in fw:
    parts.append(f'<path d="{d}" stroke="#F8D27A" stroke-width="7" fill="none"/>')
# City names.
for name, x, y in [("PEORIA", 70, 110), ("GLENDALE", 64, 470), ("PHOENIX", 300, 400), ("PARADISE VALLEY", 470, 210), ("SCOTTSDALE", 560, 330)]:
    parts.append(f'<text x="{x}" y="{y}" font-family="Public" font-weight="700" font-size="15" letter-spacing="1.5" fill="#8A8F98" text-anchor="middle" stroke="#F1EFE9" stroke-width="4" paint-order="stroke">{name}</text>')
# Routes.
pins = []
for color, box in techs:
    st = stops_in(box)
    path = [shop]
    cur = shop
    for s in st:
        path += drive(cur, s)
        cur = s
    d = rounded(path)
    parts.append(f'<path d="{d}" stroke="#FFFFFF" stroke-width="11" fill="none" stroke-linejoin="round" stroke-linecap="round"/>')
    parts.append(f'<path d="{d}" stroke="{color}" stroke-width="6" fill="none" stroke-linejoin="round" stroke-linecap="round"/>')
    for i, (x, y) in enumerate(st):
        pins.append(f'<circle cx="{x}" cy="{y}" r="12.5" fill="{color}" stroke="#fff" stroke-width="3"/><text x="{x}" y="{y + 4.8}" font-family="Public" font-weight="700" font-size="13.5" fill="#fff" text-anchor="middle">{i + 1}</text>')
parts += pins
sx, sy = shop
parts.append(f'<circle cx="{sx}" cy="{sy}" r="18" fill="#12263A" stroke="#fff" stroke-width="3.5"/><path d="M{sx - 8} {sy + 3}l8-7.5 8 7.5v7.5h-16z" fill="#fff"/>')
parts.append("</svg>")
svg = "\n".join(parts).replace(' xmlns="http://www.w3.org/2000/svg"', "")
page = open("card/front.html").read()
a = page.index("<!-- map -->") + len("<!-- map -->")
b = page.index("<!-- /map -->")
open("card/front.html", "w").write(page[:a] + "\n" + svg + "\n" + page[b:])
print("map drawn into card/front.html")
