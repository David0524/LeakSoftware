# Handoff: the two demo videos

For a new chat taking over the demo videos. Read this, then `docs/plans/demo-videos.md` (the
plan, storyboards, decisions and image prompts), then `CLAUDE.md` and `brand/BRAND.md`.

## What the owner asked for

Owner, 2026-10-21:

> Begin planning out two 45 second videos. One for leak detections, one for pool
> maintenance/cleaning. These should exciting demo videos. We want to sell the product a little
> here, but it's more about demonstrating functionality and how the app/site can be used. Show
> both the iOS (tech) side and desktop (owner) side. Incorporate live activities, route
> optimization, check lists, quotes, invoices/payments, reports, owner dashboards and more.
> Ensure the video is engaging but slow enough where the viewer can actually comprehend what's
> happening. This should utilize our colors, logos, and be in the style of a modern SaaS launch
> video. Create your own music/voice over if necessary. Use screen recordings. Simplify screens
> if it makes a more convincing video. Smooth transitions.

The owner's answers to the plan's questions:

1. **No voiceover.** Captions only.
2. **Music made in code, first,** then the video built over it ("That tends to be the better
   way to ensure that the video and audio are configured").
3. **Formats:** they'll mostly be texted; the owner asked whether 16:9 is still better. My
   recommendation, given to the owner: render both from one edit, 9:16 (1080×1920) to text,
   16:9 (1920×1080) for demos on a call. Not yet confirmed: ask if it matters.
4. **Audience:** potential customers, especially in sales demos.
5. **Treat it like a real shop,** never "demo". Names chosen (the owner hasn't objected):
   - **Canyon State Leak Detection**, Phoenix: owner Marcus Hale; techs Dana Ruiz and Jake Turner
     riding together.
   - **Blue Mesa Pool Co.**, Phoenix: owner Erin Cole; techs Luis Ramirez, Priya Shah and Tony
     Alvarez.

The owner offered to provide pool photos or anything else, and asked for ChatGPT prompts; the
eight prompts (two shop logos, six photos) are in `demo-videos.md` section 7 and were sent to the
owner in chat.

## Where it stands

- **Plan:** `docs/plans/demo-videos.md`, decided. Storyboards in sections 2 and 3, the look and
  pacing in section 1, the build approach in section 4.
- **Music: first drafts done, waiting on the owner's ear.** `apps/video/audio/score.py`
  (Python, numpy only; `python3 apps/video/audio/score.py`, about 10 s). It writes, gitignored,
  `apps/video/audio/out/{leak,pool}.wav` plus `{leak,pool}.timing.json`. Both drafts were sent
  to the owner as `.m4a` ("Sundeck music - leak/pool"). The previous chat couldn't listen to them;
  it checked the structure with a spectrogram and the loudness (-14 LUFS, true peak under
  -4 dBFS). **Ask the owner how they sound before building on them**, and adjust (tempo, key,
  mood, drum weight, lead sound) in `score.py`. Keep the 24-bar grid unless the owner wants
  another length.
  - 128 BPM, so a bar is 1.875 s and 45 s is 24 bars: intro bars 0–2 (0–3.75 s, the logo), six
    scenes of 3 bars (3.75, 9.375, 15, 20.625, 26.25, 31.875 s), end card bars 20–24
    (37.5–45 s). The storyboard tables in the plan use the earlier rough times; re-time them to
    these.
  - A riser and hit into scene 1, a whoosh ending on each scene change, a hit at the end card,
    the last chord fading to silence at 45 s.
  - Leak: A minor (Am F C G), a little darker. Pool: D major (D A Bm G), brighter.
- **Images:** all eight received from the owner and saved in `apps/video/assets/` (see
  `demo-videos.md` section 7). Real job photos can replace them later.
- **Nothing else is built:** no `apps/video` app yet, no recordings, no video shops.

## What to do next

1. **Music sign-off.** Get the owner's reaction to the drafts; revise `score.py`; re-send.
2. **The video project:** a Remotion app in `apps/video` (a pnpm workspace package, React and
   TypeScript like the rest; check Remotion's current version and its license: free for
   companies of up to 3 people). Read `timing.json` for every cut, so scenes and captions sit on
   the bars. 30 fps (a bar is 56.25 frames: round to whole frames from the seconds). Two
   compositions per video: 1920×1080 and 1080×1920, sharing the scenes, with a layout per
   aspect.
3. **An animatic first** (captions and timing on plain boxes over the music) for the owner to
   check pacing before anything is recorded.
4. **The two video shops:** a script (e.g. `scripts/video-seed.mjs`, a dry run by default with
   `--apply` to change data, like `scripts/demo-reset.mjs`) that builds Canyon State Leak
   Detection and Blue Mesa Pool Co. as their own companies on the dev project
   (`config/supabase-dev.json`; the Management API through the session proxy, see `CLAUDE.md`
   "Hosted dev project"). Include their people, customers (realistic Phoenix addresses with map
   locations set, so no paid geocoding runs; see the Mapbox note below), jobs, plans, findings,
   quotes, invoices and payments, and shop logos on reports, quotes and invoices. **Don't
   touch the shared demo company** the owner and techs use for testing.
5. **Recordings:**
   - Website: Playwright against the dev project, signed in as each shop's owner, at a 2×
     device scale factor, one clip per scene. In cloud sessions use `NODE_USE_ENV_PROXY=1
     PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` (see `CLAUDE.md`).
   - iPhone: the Simulator on a macOS GitHub Actions runner (`xcrun simctl io recordVideo`)
     while a UI test taps through each scene; upload the clips as artifacts. Add it as its own
     `workflow_dispatch` workflow; don't add steps to `ci.yml`. The repo is public, so
     artifacts can be downloaded with plain `curl` on the GitHub API.
   - The Lock Screen Live Activity and Dynamic Island: rebuild them as motion graphics from
     the real layout (`apps/ios/Sources/SundeckLiveStop/LiveStopViews.swift`); the Simulator
     can't film them cleanly.
   - "Simplify screens": hide busy parts with a recording-only flag (a URL parameter or launch
     argument), never fake a feature.
6. **Edit and render:** device frames (iPhone and a plain browser window), kinetic captions
   (Barlow Semi Condensed 800, at most 7 words, at least 2.5 s on screen), a blue tap ring a
   beat before each tap, slow push-ins that hold while the viewer reads, one transition style
   (a 0.5 s slide-and-scale). Captions burned in. Render MP4 (H.264, AAC). Send the owner each
   cut with `SendUserFile`.
7. **One review round, then final renders.** Store finals outside git (they're large); keep
   only code and small assets in the repo.

## Rules that matter here

- **Brand:** `brand/tokens.json` only, never hardcoded colors. Navy `#12263A`, Water
  `#1F6FAE`, Concrete `#E9ECEF`, Paper `#FFFFFF`; Safety orange `#EE6A1F` once per video (the
  final Start Free Trial, navy text on it, never white). No gradients or glow (BRAND.md).
  Logos: `brand/logo/` (generated; don't hand-edit). Fonts: Barlow Semi Condensed and Public
  Sans (the web app self-hosts them; reuse those files).
- **Mapbox costs money:** paid geocoding is capped at 100 lookups a month for every shop
  together, and a $5.44 surprise already happened this month. Seed every address with its
  latitude and longitude so nothing is geocoded; never loop over addresses calling the
  locate API.
- **Another session is building app features on the same repository.** Work only in
  `apps/video`, `scripts/video-*`, a new workflow file and `docs/plans/demo-videos*`. Don't edit
  app code to make a recording easier without telling the owner; if a screen needs a change,
  ask.
- **Branches and merging:** develop on your session's own branch. `CLAUDE.md` says only one
  session merges into the default branch at a time; the owner decides which. Ask before you
  merge.
- **Checks:** `pnpm format:check && pnpm lint && pnpm typecheck` before each commit, and the
  tests for what you touch. CI runs only the jobs a change affects ("What changed" in
  `ci.yml`); an `apps/video`-only change runs just the quick checks.
- **Commits:** no model names in commits or files. End commit messages with the attribution
  lines the session gives you.
- **Talk to the owner plainly:** short updates, files sent with `SendUserFile`, no jargon.
