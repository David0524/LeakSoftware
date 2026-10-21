# Demo videos: leak detection and pool service (plan)

Owner, 2026-10-21: "two 45 second videos. One for leak detections, one for pool
maintenance/cleaning … exciting demo videos. We want to sell the product a little here, but it's
more about demonstrating functionality … Show both the iOS (tech) side and desktop (owner)
side … engaging but slow enough where the viewer can actually comprehend what's happening …
our colors, logos … modern SaaS launch video … Use screen recordings. Simplify screens if it
makes a more convincing video. Smooth transitions."

Status: decided (section 6); building. The music comes first: `apps/video/audio/score.py`.

## 1. The look

- **Brand:** Navy `#12263A` backgrounds for titles, Concrete `#E9ECEF` stage behind the devices,
  Water `#1F6FAE` for highlights and the tap ring, Safety orange `#EE6A1F` once per video (the
  final Start Free Trial). Barlow Semi Condensed 800 for on-screen words, Public Sans for small
  labels. The logo lockup opens and closes each video.
- **Modern launch style, inside the brand rules** (BRAND.md: "no gradients or startup gloss"):
  big confident type, flat color, devices floating on the stage with a soft shadow, kinetic
  type that slides in by word, camera moves that push in on what matters. No gradients, no
  glow, no stock footage.
- **Devices:** an iPhone 17 frame for the tech, a clean browser window (no tabs or bookmarks)
  for the owner. Often both on screen: the phone in front of the laptop window, so the viewer
  sees one action land on the other side ("Marked complete" on the phone, the Schedule card
  turns done on the desktop).
- **Pacing for comprehension:** one idea per scene, 4 to 6 seconds each; every caption stays on
  screen at least 2.5 seconds and is 7 words or fewer; a blue tap ring shows each tap a beat
  before the screen reacts; push-ins hold still while the viewer reads; nothing important
  happens during a transition.
- **Transitions:** one family only, so it feels smooth: a 0.5 s slide-and-scale (the device
  glides out as the next glides in) and match cuts between phone and desktop on the same job.

## 2. Leak detection (45 s)

Tagline: **Find it. Prove it. Get paid.**

| Time | Scene | On screen | Caption |
|---|---|---|---|
| 0–3 | Open | Logo lockup builds on navy; the pin drops onto a water line | Sundeck Pro for leak detection |
| 3–8 | Book and route (desktop) | Schedule › Week: a new detection drops on Dana and Jake's Tuesday; Optimize; drive time ticks down ("−42 min driving") | Book it. Optimize the route. |
| 8–13 | On the way (iPhone) | Today's card for Rebecca Soto; tap On My Way; the Lock Screen Live Activity slides in ("On the way · 18 min") | Your tech's day, on the Lock Screen |
| 13–21 | The test (iPhone) | Checklist: pressure test on the return line, the line "Dropped" (red label), dye test; pin the finding on the pool diagram; a photo drops into it | Every test, every finding, recorded |
| 21–27 | Report and quote | The homeowner report builds page by page (shop's logo), Send Report; a repair quote with line items, sent | A clear report. A quote on the spot. |
| 27–33 | Customer pays (phone) | The customer's view: Accept Quote, deposit by card, receipt; desktop shows "Deposit paid" in Activity | Accepted and paid before you leave |
| 33–40 | The owner's view (desktop) | Dashboard: Collected, Owed to you, Quotes accepted counting up; the Activity dropdown opens with the day's events | See the whole business at a glance |
| 40–45 | End card | Logo, tagline, "Start Free Trial" (orange, navy text), sundeckpro.com | Find it. Prove it. Get paid. |

## 3. Pool service (45 s)

Tagline: **Every pool. Every week. On autopilot.**

| Time | Scene | On screen | Caption |
|---|---|---|---|
| 0–3 | Open | Logo lockup on navy | Sundeck Pro for pool service |
| 3–9 | Plans and routes (desktop) | 50 weekly plans fill Week's rows (Luis, Priya, Tony in their colors); Reorder Techs; Optimize Week; the five day maps redraw | Weekly routes that build themselves |
| 9–15 | The day (iPhone) | Today: 12 stops, "from home"; swipe the card from stop to stop; the Live Activity reads "Stop 3 of 12 · Then: Megan Price" | 12 stops. One tap to the next. |
| 15–22 | The visit (iPhone) | Checklist: chlorine and pH readings; the chemical calculator says what to add; the filter cleaning that's due today; before and after photos | Readings in. What to add, worked out. |
| 22–28 | The homeowner hears (phone) | Mark Complete; the visit report arrives by text and email with photos and readings | Customers see the work, automatically |
| 28–34 | The upsell | A finding on the visit (pump noise) becomes a repair quote; the customer accepts | Spot a repair. Quote it on site. |
| 34–40 | Billing and the owner (desktop) | Monthly invoices for every plan, paid by card; Dashboard and Activity | Invoices out. Payments in. |
| 40–45 | End card | Logo, tagline, Start Free Trial | Every pool. Every week. On autopilot. |

## 4. How it's made

- **Recordings:**
  - Website: Playwright drives the demo company on the dev project at 2× pixel density
    (crisp at 1080p) and records each scene as its own clip, with the same demo data every
    time (`pnpm demo:reset` first).
  - iPhone: the CI macOS runner records the Simulator (`xcrun simctl io recordVideo`) while a
    UI test taps through each scene, also from the reset demo.
  - The Lock Screen Live Activity and Dynamic Island are rebuilt as motion graphics from the
    real layout, since the Simulator can't film them cleanly.
- **Simplified screens:** where a real screen is busy (the Week board, the job page), the
  scene uses the real screen with the non-essential parts hidden by a demo-only CSS class or a
  launch argument. It is never a different product. Names, addresses and amounts are believable
  demo data, never a real customer.
- **Editing:** Remotion (React to video, rendered here with the installed Chromium and
  ffmpeg). It handles the device frames, kinetic captions, tap rings, push-ins and
  transitions, kept as code in `apps/video/`. That way a screen that changes later is
  re-recorded and re-rendered, not re-edited by hand. Remotion's license is free for
  companies of up to 3 people; larger needs a paid license.
- **Output:** 1920×1080 MP4 masters, plus burned-in captions (most social views are muted).
  Optional 1080×1920 vertical cuts for Instagram and TikTok (section 6).
- **Music and voice:** see section 6. Nothing here can make broadcast-quality music or a natural
  voice by itself; the plan works with captions only, and music or voice slot in if chosen.

## 5. Steps

1. Owner answers section 6.
2. A text-only animatic (titles, captions and timing on gray boxes) of both videos, for a
   pacing check: about half a day.
3. Record the scenes (web and iPhone) and build the motion graphics.
4. First cut of both videos, owner review, one round of changes, final render.

## 6. Decisions (owner, 2026-10-21)

1. **No voiceover:** captions only.
2. **Music made in code, first,** and the video cut to it (`apps/video/audio/score.py`, numpy
   only). 128 BPM, so 45 s is 24 bars of 1.875 s: a 2-bar intro, six 3-bar scenes, a 4-bar end
   card (the tables above are re-timed to these: 0, 3.75, 9.375, 15, 20.625, 26.25, 31.875 and
   37.5 s). A whoosh into every scene, a hit into scene 1 and the end card. About -14 LUFS.
   The script writes each track's `timing.json`, which the video reads.
3. **Both formats from one edit:** 9:16 (1080×1920) to text to prospects, since it fills a
   phone held upright; 16:9 (1920×1080) for demos on a call or a laptop. The vertical cut shows
   the phone large and crops the desktop to the part that matters.
4. **For prospects and sales demos.**
5. **A real-sounding shop in each, never "demo":**
   - **Canyon State Leak Detection** (Phoenix): owner Marcus Hale; techs Dana Ruiz and Jake
     Turner riding together.
   - **Blue Mesa Pool Co.** (Phoenix): owner Erin Cole; techs Luis Ramirez, Priya Shah and Tony
     Alvarez.
   - Each shop gets its own logo on reports, quotes and invoices (the white-label look), seeded
     as two video-only companies on the dev project, so the shared demo company stays as it is.

## 7. Images to make in ChatGPT

All photorealistic, no people's faces, no text or watermarks, no brand names. Phoenix-style
backyards: desert landscaping, block walls, palo verde trees, bright afternoon sun.

1. **Canyon State Leak Detection logo:** "A flat vector logo for a pool leak detection company
   called Canyon State Leak Detection. A simple mark of a water drop over a stylized desert mesa
   and a level line, in terracotta and deep teal on white, with the name in a bold condensed sans
   serif beside it. Clean, trustworthy, trade company look, no gradients, no shadows. Transparent
   background, 2000 px wide."
2. **Blue Mesa Pool Co. logo:** "A flat vector logo for a weekly pool cleaning company called
   Blue Mesa Pool Co. A mark of a mesa silhouette with a wave line under it in bright pool blue
   and sand, the name in a friendly rounded sans serif. Clean, modern, no gradients, no shadows.
   Transparent background, 2000 px wide."
3. **Leak finding: dye test.** "Close-up photo underwater in a residential swimming pool: a thin
   stream of dark red dye being drawn into a hairline crack beside a pool light niche, white
   plaster, clear blue water, sharp detail, natural light from above, as a leak detection tech
   would photograph it."
4. **Leak finding: skimmer.** "Close-up photo of a residential pool skimmer throat with a
   visible crack between the skimmer and the pool wall tile, dye drifting into it, clear water,
   bright daylight, documentary style."
5. **Equipment pad.** "Photo of a residential pool equipment pad in Phoenix: pump, cartridge
   filter, heater and PVC plumbing on a concrete pad beside a block wall, afternoon sun, tidy,
   realistic, no brand logos."
6. **Before cleaning.** "Photo of a residential backyard swimming pool in Phoenix with cloudy
   light green water and leaves on the bottom, desert landscaping and a block wall, afternoon
   light, slightly high angle."
7. **After cleaning.** "The same backyard pool, now crystal clear bright blue water, clean
   tile line, wet deck, same angle and light as the before photo."
8. **Hero backyard (end cards and the stage).** "Wide photo of a beautiful Phoenix backyard pool
   at golden hour, clear blue water, palo verde tree, desert landscaping, block wall, nobody in
   the frame, room on the left for text."

Send them as PNG or JPG; any of them can be swapped for real photos from a job.

**Received (owner, 2026-10-21), all eight,** in `apps/video/assets/`: `shops/canyon-state-logo.png`
and `shops/blue-mesa-logo.png` (transparent, trimmed), and `photos/leak-dye-light-niche.jpg`,
`leak-dye-skimmer.jpg`, `equipment-pad.jpg`, `pool-before.jpg`, `pool-after.jpg` (same pool and
angle as the before) and `hero-backyard.jpg`. The photos are 1536×1024 (the hero 1672×941), so
they're used inside device frames and cards, not full-bleed at 1080p without a slight upscale.
