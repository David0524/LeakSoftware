# Design review: LeakBook office website (M6)

Reviewed with the Apple Design skill (Apple Human Interface Guidelines, pinned to upstream commit
`904b0ee`). Platform: web (Next.js 16, Tailwind v4) in desktop and iPad browsers. HIG platform
conventions (menu bar, windows) do not apply to a website; the principles and foundations
(accessibility, color, typography, layout, writing) and the component guidance for buttons,
tables, sidebars, segmented controls, feedback and loading do. Artifact: the source in
`apps/web/src` plus screenshots of the running dev server (hosted dev data, owner account) at
1280 and 820 px wide, light and dark: `/`, `/sign-in`, `/sign-up`, `/jobs`, two job pages (one
with a checklist and a finding pin, one with 30 photos), `/customers`, a customer, `/schedule`
(week and day), `/settings/company`, `/settings/team`, `/settings/price-book`, `/settings/tests`.
Keyboard focus was checked by tabbing through `/sign-in`, `/jobs` and `/settings/team`. Contrast
is computed from the hex values in `brand/tokens.json` (WCAG 2 formula). No data was changed.

## Summary

The office site's job is to let a shop owner see what the trucks did today and keep the shop's
rules (prices, tests, severities) in one place. It does that plainly: a navy header, one card
style, tables for lists, real words for every state, and a pool diagram with numbered pins that
matches the phone. The thesis holds and the look is right for the trade. Rating before fixes:
**Critical issues**. In dark mode the status chips put white text on the lightened status colors
(2.66:1 to 3.3:1 at 12 px), so "Paid", "Canceled", "Inspected" and "Fail" are hard to read. Close
behind: every settings card has its own orange Save, Remove and Revoke act instantly with no way
back, the settings sidebar pushes every settings page below the fold on an iPad in portrait, and
several fixed brand colors (water blue text, navy outlines) do not adapt to dark mode.

## Critical

- **Critical: status chips fail contrast in dark mode.** `StatusBadge` (`components/ui.tsx:208-230`)
  and the job page `Chip` (`jobs/[id]/page.tsx:31-42`) draw 12 px bold white text on the status
  tokens. In dark mode the tokens switch to lighter fills: white on pass `#3FB36F` is 2.66:1, on
  excluded `#8E9DAB` 2.78:1, on fail `#E5655F` 3.30:1 (needs 4.5:1 at this size). Seen on
  "CANCELED" (customer page), "Paid", and the checklist "Inspected / Excluded" chips. The chips
  also mix a Tailwind literal (`text-white`) with the `text-paper` token, and `in_progress` uses
  `bg-water` and `scheduled` `bg-neutral-700`, which never adapt.
  `accessibility.md › Vision`: "If your app supports Dark Mode, make sure to check the minimum
  contrast in both light and dark appearances." `dark-mode.md › Dark Mode colors`: "Avoid using
  hard-coded color values or colors that don't adapt."
  **Fix:** add to `brand/tokens.json` `role.light.onStatus: "#FFFFFF"`, `role.dark.onStatus:
  "#12263A"`, plus dark `warning: "#D9A040"` and `info: "#6AAEE6"`; run `pnpm tokens` (exposes
  `text-on-status`). One shared chip in `ui.tsx`: `"... text-on-status ..."` instead of
  `text-white`/`text-paper`. Fills: `in_progress: "bg-status-info"`, `scheduled: "bg-text"`,
  the job page "To do" chip `bg-text-muted`. Results: light white on pass 5.16, fail 5.46,
  excluded 5.48, warning 5.09, info 5.33, navy `bg-text` 15.4, `bg-text-muted` 5.72; dark navy on
  pass 5.78, fail 4.66, excluded 5.54, warning 6.64, info 6.46, `bg-text` 12.93, `bg-text-muted`
  5.89. Delete the `Chip` copy in `jobs/[id]/page.tsx` and use the shared one.

## Improvements

- **High: orange on every Save.** `SettingsForm` defaults to the primary button
  (`components/settings-forms.tsx:45`), so Team shows Create Invite plus one orange Save per person,
  Test Types one per card (5+), Company two, Price Book one per opened item, Exclusions one per
  row. The public header's orange "Start Free Trial" (`(public)/layout.tsx:16-21`) doubles the
  hero's on `/`, and sits next to the form's own orange button on `/sign-in` and `/sign-up`.
  House rule: orange only for the primary action. `buttons.md › Style`: "Keep the number of
  prominent buttons to one or two per view."
  **Fix:** give `SettingsForm` a `kind?: "primary" | "secondary"` prop defaulting to
  `"secondary"`; pass `kind="primary"` only to the page's one main form: the "Add …" form on Price
  Book, Components, Severities, Exclusions and Tests, Create Invite on Team, and the single form on
  Deposits and Tax. On Company, merge profile and branding into one `<SettingsForm>` with one
  primary "Save Changes" (or make both secondary). In `(public)/layout.tsx`, render the header CTA
  with `buttonClass("secondary")`, and hide it on `/sign-up` and `/sign-in` (`usePathname` in a
  small client component, or move it into the home page only).
- **High: Remove and Revoke act at once, with no confirmation and no undo.** Remove Item, Remove
  Test Type, Remove Component, Remove Severity, Remove (exclusion) and Revoke Invite submit
  straight to `removeConfigRow`/`revokeInvite` (`team/page.tsx:83`, `price-book/page.tsx:142`,
  `tests/page.tsx:112`, `components/page.tsx:90`, `severities/page.tsx:70`,
  `exclusions/page.tsx:58-68`). They sit directly under Save at the same size, one mis-click away.
  A revoked invite link cannot be restored. `feedback.md › Best practices`: "Warn people when they
  initiate a task that can cause data loss that's unexpected and irreversible."
  **Fix:** a client `ConfirmSubmit` in `settings-forms.tsx` used when `danger` is set: the button
  opens a native `<dialog>` ("Remove Pressure test?" / "Techs won't see it on new jobs. Past jobs
  keep it.") with `Cancel` (autofocus, leading) and a danger `Remove` that calls
  `form.requestSubmit()`. Separate it from Save: put the danger form in a footer row
  `mt-6 flex justify-end border-t border-border pt-4`.
- **High: the settings sidebar pushes content below the fold on iPad.** The two columns start at
  `lg` (1024 px) (`settings/layout.tsx:30`). At 820 px the nine links stack first, about 470 px tall,
  on every settings page, so Team's content starts at 610 px. `layout.md › Adaptability`:
  "Design a layout that adapts gracefully and consistently." `designing-for-ipados.md › Best
  practices`: "Take advantage of the large display to elevate the content people care about."
  **Fix:** `md:grid-cols-[200px_1fr]` (the sidebar fits at 768 px). Below `md`, render the
  sections as a `<select aria-label="Settings section">` that navigates on change (client
  component with `useRouter`), or a single-row `flex overflow-x-auto` strip.
- **High: fixed brand colors used for text and outlines in dark mode.** `text-water` does not
  adapt: the home step numbers (`(public)/page.tsx:67`) are `#1F6FAE` on dark surface `#161E26`,
  3.16:1, and the schedule's today column heading (`schedule/page.tsx:104`) is 17 px at 3.16:1
  (needs 4.5:1). The logo file button uses `file:border-navy` (`settings/company/page.tsx:108`):
  navy on dark surface is 1.09:1, so the Choose File button has no visible edge.
  `color.md › Best practices`: "Make sure all your app's colors work well in light, dark, and
  increased contrast contexts."
  **Fix:** use `text-link` (dark `#6AAEE6`, 7.06:1 on surface; light `#1F6FAE` 5.33:1 on white)
  for both texts. File button: `file:border-navy dark:file:border-text file:text-text` (or the new
  control border below).
- **Medium: current settings section is almost invisible in dark mode.** The active item is
  `dark:bg-surface` on page `bg` (`nav-links.tsx:29`): `#161E26` on `#0E141A`, 1.10:1, with no
  other cue. **Fix:** match the job filters: `dark:bg-text dark:text-bg` (12.9:1), and add
  `font-semibold` to the active item in both modes. `lists-and-tables.md › Best practices`: a
  table that helps people navigate "persistently highlights the selected row."
- **Medium: links have no brand focus ring.** Buttons and inputs get a 3 px `outline-focus`
  (`ui.tsx:25, 97`), but every link (header nav, job filters, sidebar, table links, back links,
  schedule chips) falls back to the browser's default 1 px ring, which Safari draws in system blue
  on the navy header. **Fix:** in `globals.css`:
  `:focus-visible { outline: 3px solid var(--lb-focus); outline-offset: 2px; }` and in the dark
  header `header :focus-visible { outline-color: var(--lb-on-header); }` (water on navy would be
  only 2.89:1). `accessibility.md › Mobility` (keyboard-only work, Full Keyboard Access).
- **Medium: control borders under 3:1 in dark mode.** Inputs, selects, the search field, color
  fields and the Day/Week control use `border-neutral-500` (`ui.tsx:96`, `customers/page.tsx:29`,
  `settings-forms.tsx:103, 112, 150`, `schedule/page.tsx:53`): `#5A6875` on `#161E26` is 2.94:1, on
  `#0E141A` 3.24:1. House rule: control outlines use `color.controlBorder`, which the web tokens
  lack. **Fix:** add `role.light.controlBorder: "#5A6875"` (5.72:1 on white) and
  `role.dark.controlBorder: "#8A97A4"` (5.64:1 on surface) to `tokens.json`, run `pnpm tokens`,
  and replace `border-neutral-500` with `border-control-border` everywhere.
- **Medium: body text is 16 px.** `globals.css` sets no size, so body copy, table cells and form
  values are Tailwind's 16 px. House rule: body 17 pt, secondary 15 pt (`accessibility.md ›
  Vision`: "follow the recommended defaults"). **Fix:** `body { font-size: 17px; line-height: 1.5; }`
  in `globals.css` (rem-based utilities stay unchanged); check the jobs table at 820 px afterwards.
- **Medium: schedule controls and week view on iPad.** The Day/Week control is 36 px tall
  (`min-h-9`, `schedule/page.tsx:61`; house rule 44). The week table has `min-w-[900px]`
  (`:92`), so at 820 px Sunday is cut off behind a horizontal scroll with no hint, and the job chip
  wraps to "2:00 AM · / #1001 / Maria / Alvarez". Today is marked only by color and shade.
  **Fix:** `min-h-11` on the segments; `min-w-[760px]` and `w-32` for the tech column, with
  `whitespace-nowrap` on the chip's time line; add a visible label to today's heading
  (`<span className="ml-1 font-semibold">· Today</span>`) and `aria-current="date"`.
- **Medium: back links are small targets.** "← Jobs" and "← Customers" are bare 17 px text links,
  about 24 px tall (`jobs/[id]/page.tsx:56`, `customers/[id]/page.tsx:31`). `buttons.md › Best
  practices`: "a button needs a hit region of at least 44x44 pt." **Fix:**
  `className="inline-flex min-h-11 items-center gap-1 text-link …"`.
- **Medium: warning text in dark mode.** `text-status-warning` has no dark value: the ColorField
  note "Too light for text on white…" (`settings-forms.tsx:132`) is `#9A6210` on `#161E26`, 3.31:1
  at 15 px. **Fix:** the dark `warning: "#D9A040"` from the Critical fix (7.25:1 on surface).
- **Medium: raw values shown as words.** Finding meta shows the database value "open"
  (`jobs/[id]/page.tsx:323`); job type relies on CSS `capitalize`
  (`jobs/page.tsx:87`, `jobs/[id]/page.tsx:65`, `customers/[id]/page.tsx:94`). `writing.md › Best
  practices`: "Build language patterns." **Fix:** add `FINDING_STATUS_LABELS` (and a job type
  label map if missing) in `@leakbook/core` and use them; drop `capitalize`.
- **Medium: a photo that fails to load shows a broken image.** On the 30-photo test job every tile
  showed the browser's broken-image icon and "Photo of Job" alt text (likely the synthetic test
  uploads, but nothing handles a failed signed URL) (`jobs/[id]/page.tsx:369-376`). **Fix:** a
  small client `<GalleryImage>` with `onError={() => setFailed(true)}` that falls back to the same
  `aspect-[4/3] bg-bg text-text-muted` box as the uploading state: "Couldn't load this photo.
  Open it" (link to the URL). Make the alt say what it shows: `Photo, ${attached(m)}, ${time}`.
- **Low: status chips wrap.** "IN PROGRESS" breaks onto two lines in the jobs table at 820 px.
  Add `whitespace-nowrap` to the chip.
- **Low: loading skeletons are silent.** `PageSkeleton` and `FormSkeleton` put `aria-label` on a
  plain `div`, which screen readers ignore. Add `role="status"` and
  `<span className="sr-only">Loading…</span>`.
- **Low: job filters.** Eight pill links wrap to two rows at 820 px. House rule: `Choice` for
  more than five. Fine as links; consider a `<select>` below `md`.
- **Low: time zones show IANA IDs** ("America/Phoenix"). Label them "Arizona (no daylight
  saving)", "Pacific", etc.
- **Low: color field placeholder "NONE"** is forced uppercase by `uppercase` on the input
  (`settings-forms.tsx:112`). Use `placeholder:normal-case`.
- **Low: contrast preview grades.** 15.4:1 reads "AA" (`contrastGrade` only knows AA). Add
  "AAA" at 7:1, and the comment at `settings-forms.tsx:73` mentions navy, which is not shown.
- **Low: "Order" fields** expose `sort_order` numbers on every settings card. Later, replace with
  move up/down buttons; for now add the hint "Lower numbers come first."
- **Low: Test Type fields** are typed in a mini language (`tests/page.tsx:27-28`).
  `entering-data.md › Best practices`: "offer choices instead of requiring text entry." Acceptable
  for M6; revisit with a row-per-field editor.
- **Low: dark hero blends into the page** (`#0B1622` on `#0E141A`, 1.02:1). Add
  `border-b border-border` to the hero section.
- **Low: day view repeats its empty state.** Each tech card says "Nothing scheduled." and the page
  adds "No jobs scheduled this day." Drop the page line when every card is empty.

## Craft notes

- **Point of view:** a work-truck site, not a startup template. Navy header, condensed display
  type, square-ish cards, no gradients. The one signature is the pool diagram with numbered,
  severity-colored pins next to a numbered list, the same as the phone and the report. Keep it.
- **Restraint:** once Save buttons go secondary, orange will mean "the one thing to do here",
  which is what the brand asks for.
- **Remove one accessory:** the uppercase eyebrow `SectionTitle` (14 px, letter-spaced) is used as
  a card label and once as a fake subheading (`jobs/[id]/page.tsx:129-131`). The card labels can
  stay; use a real `h3` for "Job notes".

## What works

- **Token discipline.** Colors come from `@leakbook/tokens` utilities almost everywhere; light and
  dark follow `prefers-color-scheme` with no in-app appearance switch (`dark-mode.md › Best
  practices`).
- **Contrast in the common case:** body text on concrete 12.9:1 (light) and 14.1:1 on dark
  surface; muted 15 px text 4.82:1 on concrete, 5.72:1 on white, 6.43:1 on dark surface; navy on
  orange buttons 4.92:1 light and 6.24:1 dark; links 5.33:1 light, 7.06:1 dark.
- **44 px controls:** buttons, inputs, selects, checkbox rows, header and filter links all use
  `min-h-11`.
- **Words for every state:** "Unassigned", "Not scheduled", "Nobody yet", "Photo still uploading
  from the phone", checklist "0 inspected · 0 excluded · 8 to do". Status never relies on color
  alone, and finding pins carry numbers that match the list.
- **Empty states explain where data comes from:** "No jobs here. New jobs are created on the
  phone." and "They're added when a job is created on the phone."
- **Forms:** labels above fields, hints tied with `aria-describedby`, field errors next to the
  field, "Saving…" while pending and a live "Saved." next to the button, correct
  `autoComplete` and `inputMode` values. Sign-in offers a password or an emailed link, and the
  trial form says "30 days free" before asking for anything.
- **Loading:** every office route has a `loading.tsx` skeleton and the header renders before the
  data (`loading.md › Best practices`: "Show something as soon as possible").
- **Tables:** `scope` on headers, title-case nouns for column heads, hover rows, horizontal scroll
  inside the card instead of the page.
- **Copy:** Title Case on buttons and screen titles, sentence case elsewhere, trade words
  ("held", "excluded", "Largest drop that still passes (PSI)").

## Kept deliberately

- **White text on the shop's own color in the branding preview.** The preview shows exactly what
  reports will look like; the contrast numbers next to it are the point.
- **Severity pin colors from the database.** They are content chosen by the shop, shared with the
  phone and the report, so they are not tokens.
- **Navy header in both appearances.** It is the brand frame; `on-header` white is 15.4:1 on navy
  and 17+:1 on the dark header.
- **No sidebar hide control.** The settings list is short and is the only navigation inside
  Settings.

## Status of fixes

| # | Severity | Finding | Status |
| --- | --- | --- | --- |
| 1 | Critical | Status chips fail contrast in dark mode | Fixed: `onStatus` token (white light, navy dark), dark warning and info tokens; one shared `Chip` |
| 2 | High | Orange primary on every Save; duplicate header CTA | Fixed: settings saves are secondary; orange only on each page's main form; header trial link is an outline |
| 3 | High | Remove and Revoke act instantly, no confirmation | Fixed: every Remove and Revoke asks first (native confirm) |
| 4 | High | Settings sidebar pushes content below the fold on iPad | Fixed: two columns from `md`; the section links wrap in a row on narrow screens |
| 5 | High | `text-water` and `border-navy` don't adapt in dark mode | Fixed: `text-link` for step numbers and today; file button uses `border-text` |
| 6 | Medium | Current settings section invisible in dark mode | Fixed: active item `bg-text text-bg`, semibold |
| 7 | Medium | Links use the browser focus ring, not the token | Fixed: global `:focus-visible` ring in `--lb-focus`, on-header color in the header |
| 8 | Medium | Control borders under 3:1 in dark; no `controlBorder` token | Fixed: `controlBorder` role token (dark #8A97A4) used for all control outlines |
| 9 | Medium | Body text 16 px instead of 17 | Fixed: body 17 px / 1.5 |
| 10 | Medium | Schedule: 36 px segments, week view clipped at 820 px, today by color | Fixed: 44 px segments, 760 px minimum, `· Today` label with `aria-current="date"` |
| 11 | Medium | Back links are small targets | Fixed: 44 px tall back links |
| 12 | Medium | Warning text 3.31:1 in dark mode | Fixed by the dark warning token |
| 13 | Medium | Raw values ("open") and CSS-capitalized types | Fixed: `FINDING_STATUS_LABELS` and `JOB_TYPE_LABELS` in core |
| 14 | Medium | Failed photo shows a broken image | Fixed: `GalleryImage` falls back to a message and a link; descriptive alt text |
