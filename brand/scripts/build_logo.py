"""Generate Tidemark logo SVGs from exact geometry.

The drop-pin mark was measured from the approved ChatGPT concept and rebuilt
as clean geometry: a circle head, curved sides to the tip, a constant-width
wave band cut through the pin, and a dot above the wave.

Run:  python3 brand/scripts/build_logo.py
Needs: fonttools (pip install fonttools) for the wordmark outlines.
"""

import math
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "logo"
FONT = ROOT / "fonts" / "BarlowSemiCondensed-ExtraBold.ttf"

NAVY = "#12263A"
WATER = "#1F6FAE"
SAFETY = "#EE6A1F"
WHITE = "#FFFFFF"
BLACK = "#000000"

# Geometry, in mark units, fitted to the approved concept (RMS error < 0.1 unit).
# Head circle is centered at (0, 0); the tip points down.
R = 50.0  # head radius
TIP_Y = 101.0  # tip of the pin
SIDE_C1 = (50.0, 30.0)  # side curve handles (right side; left is mirrored)
SIDE_C2 = (32.9, 54.0)
DOT_CY, DOT_R = -19.4, 15.0
WAVE_MID, WAVE_AMP = 6.67, 4.53  # wave centerline: mid height, amplitude
WAVE_INNER = 32.0  # center trough to crest
WAVE_OUTER = 27.0  # crest to outer trough (a little tighter, as drawn)
BAND = 9.2  # wave band thickness, measured square to the wave
ARC_K = 0.5522847498  # cubic handle length for a quarter circle

# Mark bounds: x -50..50, y -50..101.
MARK_W, MARK_TOP, MARK_H = 2 * R, -R, TIP_Y + R


def f(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def pt(p):
    return f"{f(p[0])} {f(p[1])}"


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def split(bez, t):
    """Split a cubic at t; return (left, right)."""
    p0, p1, p2, p3 = bez
    a, b, c = lerp(p0, p1, t), lerp(p1, p2, t), lerp(p2, p3, t)
    d, e = lerp(a, b, t), lerp(b, c, t)
    m = lerp(d, e, t)
    return (p0, a, d, m), (m, e, c, p3)


def at(bez, t):
    m = 1 - t
    return tuple(
        m**3 * a + 3 * m * m * t * b + 3 * m * t * t * c + t**3 * d for a, b, c, d in zip(*bez)
    )


def segment(chain, u0, u1):
    """Sub-chain of cubics between global params u0 < u1 (u = index + t)."""
    out = []
    i0, i1 = int(u0), min(int(u1), len(chain) - 1)
    for i in range(i0, i1 + 1):
        a = u0 - i if i == i0 else 0.0
        b = u1 - i if i == i1 else 1.0
        bez = chain[i]
        if b < 1.0:
            bez = split(bez, b)[0]
            a = a / b if b else 0.0
        if a > 0.0:
            bez = split(bez, a)[1]
        out.append(bez)
    return out


def outline():
    """Pin outline as cubics: tip, up the right side, over the head, down the left side."""
    tip = (0.0, TIP_Y)
    k = R * ARC_K
    right = (tip, (SIDE_C2[0], SIDE_C2[1]), (SIDE_C1[0], SIDE_C1[1]), (R, 0.0))
    q1 = ((R, 0.0), (R, -k), (k, -R), (0.0, -R))
    q2 = ((0.0, -R), (-k, -R), (-R, -k), (-R, 0.0))
    left = ((-R, 0.0), (-SIDE_C1[0], SIDE_C1[1]), (-SIDE_C2[0], SIDE_C2[1]), tip)
    return [right, q1, q2, left]


def wave_y(x):
    ax = abs(x)
    if ax <= WAVE_INNER:
        return WAVE_MID + WAVE_AMP * math.cos(math.pi * ax / WAVE_INNER)
    if ax <= WAVE_INNER + WAVE_OUTER:
        return WAVE_MID - WAVE_AMP * math.cos(math.pi * (ax - WAVE_INNER) / WAVE_OUTER)
    return WAVE_MID + WAVE_AMP


def wave_edge(side, band=BAND):
    """Wave edge offset square to the centerline (side -1 = top, +1 = bottom), as cubics."""
    h = 1e-4
    pts = []
    for i in range(-36, 37):
        x = i * 2.0
        dy = (wave_y(x + h) - wave_y(x - h)) / (2 * h)
        n = math.hypot(1, dy)
        # Unit normal pointing down (+y) is (-dy, 1)/n.
        pts.append((x + side * (-dy) / n * band / 2, wave_y(x) + side * band / 2 / n))
    # Catmull-Rom through the samples, as cubics.
    segs = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        segs.append((p1, c1, c2, p2))
    return segs


def inside(poly, p):
    x, y = p
    hit = False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            hit = not hit
    return hit


def crossings(chain, poly):
    """Global params where a chain enters and leaves the outline polygon."""
    found = []
    for i, bez in enumerate(chain):
        prev = inside(poly, at(bez, 0.0))
        for j in range(1, 65):
            cur = inside(poly, at(bez, j / 64))
            if cur != prev:
                lo, hi = (j - 1) / 64, j / 64
                for _ in range(50):
                    mid = (lo + hi) / 2
                    if inside(poly, at(bez, mid)) == prev:
                        lo = mid
                    else:
                        hi = mid
                found.append(i + (lo + hi) / 2)
            prev = cur
    assert len(found) == 2, found
    return found


def locate(chain, p):
    """Global param of the point on the chain nearest p."""
    best = (1e9, 0.0)
    for i, bez in enumerate(chain):
        for j in range(2001):
            q = at(bez, j / 2000)
            d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2
            if d < best[0]:
                best = (d, i + j / 2000)
    return best[1]


def curves(segs):
    return " ".join(f"C{pt(s[1])} {pt(s[2])} {pt(s[3])}" for s in segs)


def reverse(segs):
    return [(s[3], s[2], s[1], s[0]) for s in reversed(segs)]


def mark_paths(dot_hole=False, small=False):
    """Return (pin_path_d, dot_path_d). The dot is cut from the pin when dot_hole.

    small: favicon cut with a thicker wave and bigger dot so they survive 16-32 px.
    """
    band, dot_r = (BAND * 1.6, DOT_R * 1.2) if small else (BAND, DOT_R)
    out = outline()
    poly = [at(b, j / 200) for b in out for j in range(200)]
    n = len(out)

    top, bot = wave_edge(-1, band), wave_edge(+1, band)
    t_in, t_out = crossings(top, poly)
    b_in, b_out = crossings(bot, poly)
    top_in = segment(top, t_in, t_out)
    bot_in = segment(bot, b_in, b_out)

    # Outline params where each edge meets it.
    ut_right = locate(out, top_in[-1][3])
    ut_left = locate(out, top_in[0][0])
    ub_right = locate(out, bot_in[-1][3])
    ub_left = locate(out, bot_in[0][0])

    # Head cap: outline from right over the top to left, then along the top edge back to the right.
    cap_outline = segment(out, ut_right, ut_left)
    cap = f"M{pt(top_in[-1][3])} {curves(cap_outline)} {curves(top_in)} Z"

    # Body: bottom edge left to right, then the outline down the right side to the tip and up the left.
    body_outline = reverse(segment(out, 0.0, ub_right)) + reverse(segment(out, ub_left, float(n)))
    body = f"M{pt(bot_in[0][0])} {curves(bot_in)} {curves(body_outline)} Z"

    dot = (
        f"M{f(-dot_r)} {f(DOT_CY)} a{f(dot_r)} {f(dot_r)} 0 1 0 {f(2 * dot_r)} 0 "
        f"a{f(dot_r)} {f(dot_r)} 0 1 0 {f(-2 * dot_r)} 0 Z"
    )
    pin = f"{cap} {body}"
    if dot_hole:
        pin = f"{pin} {dot}"
    return pin, dot


def mark_group(pin_fill, dot_fill=None, tx=0.0, ty=0.0, scale=1.0, small=False):
    """SVG group for the mark. dot_fill=None cuts the dot out of the pin."""
    pin, dot = mark_paths(dot_hole=dot_fill is None, small=small)
    parts = [f'<path fill="{pin_fill}" fill-rule="evenodd" d="{pin}"/>']
    if dot_fill:
        parts.append(f'<path fill="{dot_fill}" d="{dot}"/>')
    return (
        f'<g transform="translate({f(tx)} {f(ty)}) scale({f(scale)})">' + "".join(parts) + "</g>"
    )


def svg(w, h, body, bg=None, title="Tidemark"):
    rect = f'<rect width="{f(w)}" height="{f(h)}" fill="{bg}"/>' if bg else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(w)} {f(h)}" '
        f'width="{f(w)}" height="{f(h)}" role="img" aria-label="{title}">'
        f"<title>{title}</title>{rect}{body}</svg>\n"
    )


def mark_svg(pin_fill, dot_fill, pad=0.0):
    w, h = MARK_W + 2 * pad, MARK_H + 2 * pad
    g = mark_group(pin_fill, dot_fill, tx=R + pad, ty=R + pad)
    return svg(w, h, g)


def square_icon(size, bg, pin_fill, dot_fill, mark_height_ratio, small=False):
    """Mark centered in a square. Centers the head+tip box, nudged up so it sits optically centered."""
    scale = size * mark_height_ratio / MARK_H
    tx = size / 2
    ty = (size - MARK_H * scale) / 2 - MARK_TOP * scale - size * 0.01
    group = mark_group(pin_fill, dot_fill, tx=tx, ty=ty, scale=scale, small=small)
    return svg(size, size, group, bg=bg)


def wordmark_paths(text_parts, cap_height):
    """Outline text with the brand font. text_parts: [(text, fill)]. Returns (svg, width)."""
    font = TTFont(FONT)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    cap = font["OS/2"].sCapHeight
    s = cap_height / cap
    x = 0.0
    out = []
    for text, fill in text_parts:
        ds = []
        for ch in text:
            name = cmap[ord(ch)]
            pen = SVGPathPen(glyph_set, ntos=lambda v: f(v))
            # Flip y and place baseline at cap_height so caps span 0..cap_height.
            tpen = TransformPen(pen, (s, 0, 0, -s, x, cap_height))
            glyph_set[name].draw(tpen)
            ds.append(pen.getCommands())
            x += hmtx[name][0] * s
        out.append(f'<path fill="{fill}" d="{" ".join(ds)}"/>')
    return "".join(out), x


def lockup(tide_fill, mark_fill, pin_fill, dot_fill, bg=None, pad=0.0):
    """Horizontal lockup: mark, gap, wordmark. Cap height ~= 46% of mark height."""
    mark_h = MARK_H
    cap_h = mark_h * 0.46
    gap = mark_h * 0.2
    words, words_w = wordmark_paths([("Tide", tide_fill), ("mark", mark_fill)], cap_h)
    w = MARK_W + gap + words_w + 2 * pad
    h = mark_h + 2 * pad
    mark = mark_group(pin_fill, dot_fill, tx=R + pad, ty=R + pad)
    # Align caps to the visual middle of the head-and-body, slightly above center.
    wy = pad + (mark_h - cap_h) / 2 - mark_h * 0.06
    text = f'<g transform="translate({f(MARK_W + gap + pad)} {f(wy)})">{words}</g>'
    return svg(w, h, mark + text, bg=bg)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = {
        # Mark only
        "tidemark-mark.svg": mark_svg(WATER, SAFETY),
        "tidemark-mark-reverse.svg": mark_svg(WHITE, SAFETY),
        "tidemark-mark-black.svg": mark_svg(BLACK, None),
        "tidemark-mark-white.svg": mark_svg(WHITE, None),
        # Horizontal lockups
        "tidemark-logo.svg": lockup(NAVY, WATER, WATER, SAFETY),
        "tidemark-logo-reverse.svg": lockup(WHITE, WHITE, WHITE, SAFETY),
        "tidemark-logo-black.svg": lockup(BLACK, BLACK, BLACK, None),
        # App icons
        "tidemark-app-icon.svg": square_icon(1024, NAVY, WHITE, SAFETY, 0.62),
        # Android adaptive foreground: art inside the 66% safe zone, transparent.
        "tidemark-adaptive-foreground.svg": square_icon(1024, None, WHITE, SAFETY, 0.46),
        # Android 13+ themed (monochrome) icon: one color, dot cut out, transparent.
        "tidemark-adaptive-monochrome.svg": square_icon(1024, None, WHITE, None, 0.46),
        # Favicon: larger mark, small-size cut (thicker wave, bigger dot).
        "tidemark-favicon.svg": square_icon(64, NAVY, WHITE, SAFETY, 0.84, small=True),
    }
    for name, content in files.items():
        (OUT / name).write_text(content)
        print("wrote", OUT / name)


if __name__ == "__main__":
    main()
