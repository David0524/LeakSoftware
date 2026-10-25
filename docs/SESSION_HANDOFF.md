# Session handoff (2026-10-25)

For a new Claude Code session picking up from the long launch-prep session (2026-10-11 to
2026-10-25). Read `CLAUDE.md` first, then `docs/DECISIONS.md` (newest first), then this file.
`docs/OWNER_TODO.md` lists what only the owner can do.

## How work ships (as practiced; CLAUDE.md has the rules)

- Work on the session branch, then fast-forward the default branch `claude/cool-keller-efjc00`
  to it once the website's CI jobs are green; that deploys sundeckpro.com (Vercel).
- Migrations: name after the latest prefix on the default branch (latest:
  `20261022003200_report_photo.sql`, deployed), check
  `supabase_migrations.schema_migrations` on the dev project, then deploy from a clean worktree
  of the pushed commit: `git worktree add <tmp> <sha> && cd <tmp> && NODE_USE_ENV_PROXY=1 node
  scripts/deploy-db.mjs`, before merging.
- CI status without `gh`: the repo is public, so
  `https://api.github.com/repos/David0524/LeakSoftware/actions/runs?head_sha=<sha>` works with
  plain curl. Artifacts and dispatch go through the GitHub MCP tools.
- iPhone: start `testflight.yml` on the pushed branch together with CI. Look at CI's
  `iphone-screenshots` artifact before telling the owner a build is ready.
- Run helpers (subagents) on Sonnet for routine work (screenshots, checks, small changes) and
  keep Opus for hard problems; keep few running at once (owner is cost-aware, 2026-10-25).

## Where things stand

### App Store (launch target Nov 1; release is manual)
- Build **1.0.0 (1057)** (commit f98f49b) is in TestFlight, "Ready to Submit". The owner is
  using Claude in Chrome to attach it, upload the 8 screenshots and submit; Chrome asks the
  owner before **Add for Review** / **Submit for Review**. Listing, privacy label, review
  contact and notes were filled in earlier.
- Screenshots: `apps/ios/AppStore/compose.py` builds them (sources: the App Store screenshots
  workflow artifact, launch film screens, and the owner's real `schedule-day.png` for the route
  map, `--phone`). Upload order: Today, Route map, Findings, Leak checklist, Report, Quote,
  Messages, Pool visit.
- Review account: `appreview@sundeckpro.com`, owner of the review shop "Palo Verde Pool Service
  (App Review)" (texts/emails recorded, never delivered). **The password is not in the repo**;
  the owner has it. `scripts/review-account.mjs` can reset it (read its output carefully: its
  first line names the role, not the password).
- If App Review comes back, answer from `docs/release/APP_STORE.md`.

### Backend
- Supabase dev project `evmxdfasurkaxbwkceti` is also production for now (free plan; Pro later,
  owner's call).
- Auth email goes through Resend SMTP (`account@send.sundeckpro.com`, 30/hour) and the
  repository's templates (`supabase/templates/*.html`) are installed on the project.
- UptimeRobot watches `https://sundeckpro.com/api/health`.

### Shipped in the last day (all four platforms unless noted)
Chemicals added with Charge for Chemicals and monthly reports; the chemicals card's keyboard
Done and the end of per-keystroke saving; Require a Photo for visit reports; price book with
Chemicals first and a category picker; the website's own pop-up style (website only; apps keep
system alerts); sign-in forms never ask "Discard changes?"; document link previews (white card
on light blue); App Review fixes (`/in-app/*` pages without the menu, setup wording).

## Open work

1. **3D logo clip v2** (`apps/video/logo3d/blender/scene_day.py`; render with `logo-3d.yml`,
   workflow_dispatch only, 20 runners × 18 frames, 96 samples, about 4.5 h).
   - v2 fixes are in (2-second face-on hold, smooth logo, soft streak, lighter palms, glints no
     longer re-randomise). Owner then said the sea sparkles are too many, too fast and too
     frequent: commit c37d3fb starts glints in a band under the sun, about a third as many,
     each flashing 3 times per loop (band centred 20° left; the sun itself is off-frame left).
   - **c37d3fb is verified** (2026-10-25): full-loop temporal diff matches v2 with no added
     motion, the seam is exact (0.023 mean), and frames 1 and 120 at 1080p/96 samples look
     right. The owner has the v3 preview; **waiting on the owner's go for the full render.**
     For any later scene change, repeat those checks and show a preview first. Nothing goes
     live until the owner approves the finished clip; a sound version comes after.
   - Licensed music is never committed (public repo).
2. **Owner tasks** (no action until they say): Stripe real test payment; Supabase Pro; Android
   on Google Play after the D-U-N-S number (`docs/play-store/README.md`); the rest of
   `docs/OWNER_TODO.md`.
3. **On hold:** the 3D clip in the apps (portrait render). The laminate card exists
   (`apps/video/card/`); ask the owner whether anything is left on it.

## Files that only existed in the old session's container
`video-delivery/` (git-excluded) held deliverables already sent to the owner: App Store
screenshots and Chrome handoffs, the hat logo pack (built from `brand/logo/*.svg`), card PDFs,
launch films, 3D previews. A new container won't have them; rebuild from the repo if needed and
ask the owner for anything that can't be rebuilt.
