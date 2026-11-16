"""The 6 x 9 mailer's deliverables, from card/mailer.mjs's renders (run from apps/video):

    out/mailer-<side>-trim.png   the trimmed 9 x 6 in side at the render's scale
    out/mailer-<side>-share.jpg  2700 x 1800, for texting
    out/mailer-print.pdf         two pages, front then back, 9.25 x 6.25 in with the 0.125 in
                                 bleed, at 600 per inch: what a print-and-mail service takes

    python3 card/mailer_finish.py
"""

from PIL import Image

pages = []
for side in ("front", "back"):
    bleed = Image.open(f"out/mailer-{side}-bleed.png").convert("RGB")
    scale = bleed.width / 2775
    m = round(37.5 * scale)
    trim = bleed.crop((m, m, m + round(2700 * scale), m + round(1800 * scale)))
    trim.save(f"out/mailer-{side}-trim.png")
    trim.resize((2700, 1800), Image.LANCZOS).save(f"out/mailer-{side}-share.jpg", quality=90)
    pages.append(bleed.resize((5550, 3750), Image.LANCZOS))
pages[0].save("out/mailer-print.pdf", resolution=600, save_all=True, append_images=pages[1:])
print("out/mailer: trim and share for front and back, print PDF (2 pages)")
