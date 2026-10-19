# Owner's list, 2026-10-19 (second batch): all four platforms

The owner answered the three open questions from the first list and asked for twelve more
changes. From now on every update ships on the desktop website, the mobile website, the Swift
iPhone app, and the Android (Expo) app together (CLAUDE.md, How to work).

Each item: what changes, the data, and the wording. Built in this order, one commit per item
(website and core first, then both apps).

## A. Answers to the first list's questions

1. **Cleanings sync to phones.** `plan_cleaning` gets `device_sync = true` (a migration on the
   registry row; reads stay "member", writes stay owner-only, so phones read it). The apps then
   show what the website shows: the Today pill for a cleaning due within a week, the visit's
   Regular cleanings box with the cadence and countdown, and Customer › Maintenance lines.
2. **Request a Feature is a text box in every app** (owner: "Make it a text box built into the
   platform. No need to make a separate email"). New endpoint `POST /api/feature-requests`
   (bearer token, like the other phone endpoints) runs the website's `requestFeature` logic
   (saved to `feature_request`; the office is still notified by email when email is set up).
   Both apps get the website's sheet: one box and Send Request. The mailto row goes away.
3. **Wording (owner: "Your call").**
   - Scheduled → unscheduled is **Unschedule**. **Reopen Job** stays only for a canceled job
     (canceled → unscheduled), where it is true; a finished visit going back to in progress is
     **Reopen Visit**. Core: `jobActionLabel(from, to)`.
   - The job's price is **Detection fee** only on leak detection; repairs and visits say
     **Price**. Core: `jobFeeLabel(type)`.

## B. New requests

1. **Chemical is a dropdown on the visit's checklist** ("There is no way back to the job from
   the chemical page"). The Chemical button becomes a **Chemical** card at the top of the
   Checklist that opens in place (chevron), closed by default with a one-line summary ("Last:
   FC 3 · pH 7.6 · Mon 8:15 AM", or "Add today's readings"). Open: Gallons (from the pool),
   the six readings with Aim For, Chlorine and Acid, then **What to Add** right under them (the
   same numbered steps, updating as readings are typed), then **Submit**. Nothing leaves the
   job. The full Chemical screen stays for More and Customer › Pool, with its log.
2. **Remove any checklist item.** Today only repeatable items can be removed. Every item gets
   Remove Item (the verdict menu, the X on a check row, swipe on phones with the menu as the
   visible alternative), with the confirm sheet. A scheduled cleaning removed from a visit stays
   due and goes on the next visit (the confirm says so).
3. **"When they called" is renamed From the Customer**, on New Job and the job page (it was
   "When They Call" / "When they called" / "When they booked"). The "Size of the pool" question
   goes (a migration drops `pool_size` from every shop's `intake_questions` and the default);
   New Job asks **Gallons** instead, saved on the pool (`property.approx_gallons`).
4. **Gallons in job Details.** The job's On Site form gets **Pool gallons** (typed as
   "20,000"; blank clears it). It writes `property.approx_gallons`, so the customer's pool and
   the Chemical dropdown show it at once.
5. **No leak checkbox on visits.** "Leak location marked" shows only on leak detection jobs.
6. **Cleaner pills.** On Today, a cleaning due soon is the cleaning's icon and a few words
   ("Today", "3 days", "1 week", "Overdue"), plain gray text with no fill; VoiceOver reads
   "Clean filter due in 3 days". The access notes lose the orange fill and show as a plain line
   with a key icon. Core: `cleaningShortLabel(countdown)`.
7. **Replace filter tracker.** A third scheduled item, **Replace filter** (`svc_filter_replace`,
   a maintenance service item on a schedule, default every 12 months, its own icon: a cartridge
   with a fresh-arrow), separate from Clean filter. A plan's Replace filter has **Last replaced**
   (`plan_cleaning.last_done_on`, now client-writable for owners), and the filter's age shows
   wherever the cleaning does: "Filter 8 months old" (core `filterAge(lastDone, today)`). Doing
   it on a visit resets the age, as cleanings already move their dates.
8. **Navigation from the address.** "Not on the map yet" and Mark Location Here go from the job
   page in every app: directions already open the maps app with the address. Routes find pools
   from their address: loading a route day looks up any stop without coordinates (when the
   routing service is set up), so pools added on a phone get placed too. Schedule's note about
   "No map location" says the address couldn't be found and to check it on the customer's pool.
9. **Pool shape tiles: Draw and Clear.** The Pool Shape sheet's tiles become two rows of five:
   Rectangle, Oval, Kidney, L-shape, Roman, Grecian, Figure 8, **Landmarks**, **Draw**, **Clear**.
   Freeform leaves the tiles (pools already set to it keep drawing it); Draw covers it.
10. **Draw.** Draw opens drawing tools over the diagram: **Line**, **Circle**, **Freeform**
    (segmented), Undo, Done. Lines and circles drag out; Freeform follows the finger. Works on a
    preset shape or on a blank one. Drawn in the pool's water outline. Stored in
    `property.diagram_layout.drawing`: `[{type:"line",x1,y1,x2,y2}, {type:"circle",cx,cy,rx,ry},
    {type:"pen",points:[[x,y],...]}]`, 0..1 of the 160 x 100 diagram, at most 40 shapes.
    **Clear** (confirm sheet) empties the diagram: no outline (shape `custom`), no spa, no
    drawing, no landmarks. The pins and the job's markup are not touched.
11. **Landmarks.** The Landmarks tile opens a row of simple icons: Tree, Rock, Waterfall,
    Steps, Equipment, House. Tap one, then tap the diagram to put it there; drag to move; tap it
    to select, then Remove. Stored in `diagram_layout.landmarks`: `[{kind, x, y}]`, at most 30.
    One drawn outline style, in the muted text color, the same on every platform (core
    `LANDMARKS` paths).
12. **Spa on the diagram.** Spa size and Spa shape leave the sheet. With Has a spa on, tap the
    spa to switch round and square, drag it to move, and pinch (or drag the corner handle) to
    resize. Keyboard: arrows move, + and - resize, Enter switches the shape; VoiceOver and
    TalkBack get Larger, Smaller, Round/Square, and move actions. Stored as before with a radius:
    `spa: {x, y, r, shape, size}` (`r` 7 to 28 diagram units; `size` is the nearest preset so
    older app builds still draw it close).

## Data changes

- Migration: `plan_cleaning` `device_sync = true`; `last_done_on` client-writable (insert and
  update, owners); the `svc_filter_replace` component type for every shop and the default;
  `pool_size` dropped from `intake_questions`; `property.diagram_shape` allows `custom`.
- `diagram_layout` keeps its shape; `parseDiagramLayout` accepts `drawing`, `landmarks`, and
  `spa.r`, and drops anything else. Older app builds ignore the new keys.
- New endpoint `POST /api/feature-requests`.

## Status

- **Website and core:** every item built and committed (commits `8bd3daf` to `e9427d1`).
  Checked on a local build against the dev project: a visit's Checklist (the Chemical
  dropdown with What to Add, Edit with Remove), and the Pool Shape sheet (ten tiles, Draw,
  landmarks, the square spa resized, the Clear confirm). The price book switch is now "Show
  when booking a repair" ("On the repair menu"), since When They Call was renamed.
- **Apps:** see the commits prefixed "Swift:" and "Expo:".
