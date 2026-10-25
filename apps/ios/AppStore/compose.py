"""Builds the App Store screenshots (docs/release/APP_STORE.md, section 6): a headline, a line
under it and the real app screen in a drawn phone frame, 1320 x 2868, RGB, no transparency.

    python3 apps/ios/AppStore/compose.py --store <dir> --film <dir> [--ci <dir>] [--out <dir>]

Inputs are the raw screens from three workflow artifacts (gh run download <id> -n <name> -D <dir>):

    --store  app-store-screenshots   (App Store screenshots workflow: 01-today.png ... 10-*.png)
    --film   launch-video-iphone     (Launch video iPhone screens: lv-*.png, the same demo shop)
    --ci     iphone-screenshots      (CI's screenshot job; only a fallback)

Each shot takes the first of its sources that exists. A source is cut to one screen from the top
(never scrolled or edited), except that an empty band under the status bar, left by the store
helper before 2026-10-24, is taken out. Renders that have no status bar (film, CI) get the store
shots' 9:41 bar. render.mjs draws the frames; this script then flattens each PNG, checks its size
and makes contact-sheet.jpg, with a row at the size App Store search results show (230 px wide).
"""

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageStat

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
WIDTH, HEIGHT = 1320, 2868
# The screen inside the frame (frame.html .screen).
SCREEN_W, SCREEN_H = 1052, 2286

# The order they're uploaded in. The first three show in search results. Captions: short, plain,
# no buying, subscribing, trials or prices (App Review 3.1.3; APP_STORE.md section 7).
SHOTS = [
    {
        "name": "01-today",
        "title": "Your Whole Day, in Route Order",
        "subtitle": "Next stop, drive time and gate code up front.",
        "sources": [("film", "lv-today.png"), ("store", "01-today.png")],
    },
    {
        "name": "02-findings",
        "title": "Pin Each Leak on the Pool",
        "subtitle": "Draw the pool. Log every pressure test.",
        "sources": [("film", "lv-findings.png"), ("store", "06-findings.png")],
    },
    {
        "name": "03-leak-checklist",
        "title": "Check Every Line, Note Every Leak",
        "subtitle": "Skimmers, returns, lights and drains.",
        "sources": [("film", "lv-checklist.png"), ("store", "05-leak-checklist.png")],
    },
    {
        "name": "04-report",
        "title": "The Report, Done Before You Leave",
        "subtitle": "Read and signed on your phone.",
        "sources": [("store", "07-review.png"), ("ci", "17-review.png")],
    },
    {
        "name": "05-quote",
        "title": "Quote the Repair From the Findings",
        "subtitle": "Prices come from your own price book.",
        "sources": [("film", "lv-quote.png"), ("store", "09-quote.png")],
    },
    {
        "name": "06-messages",
        "title": "Text Customers From the Shop Number",
        "subtitle": "One business line for the whole team.",
        "sources": [("store", "10-messages.png")],
    },
    {
        # A real iPhone screenshot from the owner (2026-10-25): the live map can't be drawn off
        # screen. Shared through chat it lost its status bar, so it gets the store shots' bar.
        "name": "08-route-map",
        "title": "Every Route on a Map",
        "subtitle": "Optimize puts the stops in the shortest order.",
        "sources": [("phone", "schedule-day.png")],
        "pad_top": True,
    },
    {
        "name": "07-pool-visit",
        "title": "Pool Service Visits, Too",
        "subtitle": "Readings, cleanings and a checklist.",
        "sources": [("film", "lv-cleanings.png"), ("store", "03-pool-visit.png")],
    },
]


def flat(path: Path) -> Image.Image:
    """The picture on white, without alpha."""
    image = Image.open(path)
    if image.mode in ("RGBA", "LA", "P"):
        image = image.convert("RGBA")
        base = Image.new("RGB", image.size, "white")
        base.paste(image, mask=image.getchannel("A"))
        return base
    return image.convert("RGB")


def uniform(row: Image.Image) -> bool:
    return max(ImageStat.Stat(row).stddev) < 0.6


def trim_gap(image: Image.Image) -> Image.Image:
    """Takes out the empty band (62 pt) the store helper left under the status bar, if present."""
    scale = image.width / 440
    extra = round(62 * scale)
    best, run, start = (0, 0), 0, 0
    for y in range(round(48 * scale), round(240 * scale)):
        if uniform(image.crop((0, y, image.width, y + 1))):
            if run == 0:
                start = y
            run += 1
            if run > best[1]:
                best = (start, run)
        else:
            run = 0
    start, run = best
    if run < extra + round(10 * scale):
        return image
    cut = start + (run - extra) // 2
    out = Image.new("RGB", image.size, image.getpixel((2, image.height - 2)))
    out.paste(image.crop((0, 0, image.width, cut)), (0, 0))
    out.paste(image.crop((0, cut + extra, image.width, image.height)), (0, cut))
    return out


def status_bar(store: Path | None) -> Image.Image | None:
    """The store shots' 9:41 status bar as black glyphs with alpha, 440 pt wide at 3x."""
    if not store:
        return None
    for path in sorted(store.glob("*.png")):
        image = flat(path)
        if image.size != (WIDTH, HEIGHT):
            continue
        band = image.crop((0, 0, WIDTH, 56 * 3)).convert("L")
        background = band.getextrema()[1]
        # Darker than the page is ink; how much darker is how opaque.
        alpha = band.point(lambda v: 0 if v >= background else min(255, (background - v) * 255 // max(1, background - 20)))
        glyphs = Image.new("RGBA", band.size, (0, 0, 0, 255))
        glyphs.putalpha(alpha)
        return glyphs
    return None


def has_status_bar(image: Image.Image) -> bool:
    top = image.crop((0, round(image.width / 440 * 20), image.width, round(image.width / 440 * 44))).convert("L")
    return ImageStat.Stat(top).extrema[0][0] < 100


def prepare(path: Path, bar: Image.Image | None, pad_top: bool = False) -> Image.Image:
    image = flat(path)
    padded_bar = False
    if pad_top:
        # A screenshot cut just below the status bar: put the bar back above it (62 pt on a
        # 6.9" iPhone). Its own content would read as a status bar to has_status_bar.
        band = round(image.width / 440 * 62)
        padded = Image.new("RGB", (image.width, image.height + band), image.getpixel((2, 2)))
        padded.paste(image, (0, band))
        image = padded
        padded_bar = bar is not None
    if image.width == WIDTH:
        image = trim_gap(image)
    tall = round(image.width * HEIGHT / WIDTH)
    screen = Image.new("RGB", (image.width, tall), image.getpixel((2, min(image.height, tall) - 2)))
    screen.paste(image.crop((0, 0, image.width, min(image.height, tall))), (0, 0))
    if bar is not None and (padded_bar or not has_status_bar(screen)):
        glyphs = bar.resize((screen.width, round(bar.height * screen.width / bar.width)), Image.LANCZOS)
        screen.paste(glyphs, (0, 0), glyphs)
    return screen.resize((SCREEN_W, SCREEN_H), Image.LANCZOS)


def contact_sheet(finals: list[Path], out: Path) -> None:
    big, small, gap = 400, 230, 40
    font = ImageFont.truetype(str(ROOT / "brand/fonts/PublicSans-Medium.ttf"), 26)
    n = len(finals)
    width = gap + n * (big + gap)
    big_h = round(big * HEIGHT / WIDTH)
    small_h = round(small * HEIGHT / WIDTH)
    sheet = Image.new("RGB", (width, gap + big_h + 50 + gap + small_h + 50 + gap), "white")
    draw = ImageDraw.Draw(sheet)
    for i, path in enumerate(finals):
        image = Image.open(path)
        x = gap + i * (big + gap)
        sheet.paste(image.resize((big, big_h), Image.LANCZOS), (x, gap))
        draw.text((x, gap + big_h + 10), path.name, fill="black", font=font)
    y = gap + big_h + 50 + gap
    draw.text((gap, y - 36), "At App Store search size (230 px wide):", fill="black", font=font)
    for i, path in enumerate(finals):
        image = Image.open(path)
        sheet.paste(image.resize((small, small_h), Image.LANCZOS), (gap + i * (small + 20), y + 10))
    sheet.save(out, quality=90)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--store", type=Path)
    parser.add_argument("--film", type=Path)
    parser.add_argument("--ci", type=Path)
    parser.add_argument("--phone", type=Path, help="real iPhone screenshots (schedule-day.png)")
    parser.add_argument("--out", type=Path, default=ROOT / "video-delivery/app-store-screenshots/final")
    parser.add_argument("--only", help="build only the shots whose name contains this")
    args = parser.parse_args()
    folders = {"store": args.store, "film": args.film, "ci": args.ci, "phone": args.phone}
    args.out.mkdir(parents=True, exist_ok=True)
    scratch = tempfile.TemporaryDirectory()
    screens = Path(scratch.name)
    bar = status_bar(args.store)
    manifest = []
    for shot in SHOTS:
        if args.only and args.only not in shot["name"]:
            continue
        source = next(
            (folders[k] / f for k, f in shot["sources"] if folders[k] and (folders[k] / f).exists()), None
        )
        if source is None:
            sys.exit(f"{shot['name']}: none of {shot['sources']} found")
        print(f"{shot['name']} <- {source}")
        screen = screens / f"{shot['name']}.png"
        prepare(source, bar, shot.get("pad_top", False)).save(screen)
        manifest.append(
            {
                "title": shot["title"],
                "subtitle": shot.get("subtitle"),
                "logo": shot.get("logo"),
                "screen": str(screen),
                "out": str(args.out / f"{shot['name']}.png"),
            }
        )
    with tempfile.NamedTemporaryFile("w", suffix=".json") as listing:
        json.dump(manifest, listing)
        listing.flush()
        subprocess.run(["node", str(HERE / "render.mjs"), listing.name], check=True)
    finals = []
    for item in manifest:
        path = Path(item["out"])
        image = Image.open(path).convert("RGB")
        assert image.size == (WIDTH, HEIGHT), f"{path} is {image.size}"
        image.save(path, optimize=True)
        assert Image.open(path).mode == "RGB"
        finals.append(path)
    scratch.cleanup()
    if not args.only:
        contact_sheet(finals, args.out / "contact-sheet.jpg")
    print(f"{len(finals)} screenshots in {args.out}")


if __name__ == "__main__":
    main()
