# Demo videos: leak detection and pool service (plan)

Owner, 2026-10-21: "two 45 second videos. One for leak detections, one for pool
maintenance/cleaning … exciting demo videos. We want to sell the product a little here, but it's
more about demonstrating functionality … Show both the iOS (tech) side and desktop (owner)
side … engaging but slow enough where the viewer can actually comprehend what's happening …
our colors, logos … modern SaaS launch video … Use screen recordings. Simplify screens if it
makes a more convincing video. Smooth transitions."

Status: plan, waiting on the owner's answers in section 6.

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

## 6. Decisions for the owner

1. **Voiceover:** captions only (recommended: most demos play muted), or a voice. A natural
   voice needs a text-to-speech service: ElevenLabs is about $5 a month, and needs your
   account key. The script would be the captions above, said a little fuller.
2. **Music:** a licensed royalty-free track you pick (Artlist or Epidemic Sound, about
   $10–20 a month; recommended), or a simple beat made in code (free, but it will sound basic).
3. **Formats:** 16:9 only, or 16:9 plus 9:16 vertical cuts for social.
4. **Where they'll be used** (website hero, App Store preview, social, sales emails). An App
   Store preview has its own rules: 15–30 seconds, recorded on device, no frames. It would be a
   separate short cut.
5. **Demo names:** keep the demo company's names (Dana, Jake, Luis, Priya, Tony; Rebecca
   Soto), or use a fictional shop name and logo on reports to show the white-label look.
