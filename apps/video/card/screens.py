"""Screens for the laminate card, cut from the film's captures (run from apps/video/card after a
capture; the results are committed, since captures/ is not). findings.png is the top of the
iPhone suite's lv-findings capture (LaunchVideoShots.swift), cut by hand.

quote-accepted.png: the customer's quote page after accepting, with the "Prepared for" card
left out (as if scrolled under the shop's header) so the deposit line fits on the phone.
"""

from PIL import Image

im = Image.open("../captures/web/phone-quote-accepted.png").convert("RGB")
head, body = im.crop((0, 0, 1179, 687)), im.crop((0, 1130, 1179, im.height))
out = Image.new("RGB", (1179, head.height + body.height), (242, 242, 247))
out.paste(head, (0, 0))
out.paste(body, (0, head.height))
out.save("screens/quote-accepted.png")
print(out.size)
