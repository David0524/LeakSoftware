# Reorder Techs: the order of techs on the Schedule

Owner, 2026-10-21: "Make a way to reorder techs in the schedule."

Every platform, the same words and behavior: the desktop website, the mobile website, the iPhone
app (apps/ios) and the Android app (apps/mobile).

## What's saved

- `membership.schedule_order`: a person's place, 1 first, per shop (migration
  `20261021000100_schedule_order.sql`). Null means never placed.
- Owners and admins set it, like a tech's color: it's a client-writable, synced column of
  `membership`, whose write role is managers. Techs and other shops can't change it
  (`supabase/tests/610_schedule_order.test.sql`).

## The order (core `scheduleOrder`, ported in SundeckCore Team.swift)

- When anyone in the shop has a place, the saved order wins: people with a place first, lowest
  first, then anyone without one (someone added since) A to Z by name.
- With no saved order, the old rule: the person signed in ("Me") first, then A to Z.
- **Me first only while there's no saved order.** Once an owner has set an order, everyone sees
  that order, Me included where they were put: the owner set it on purpose, and one shared order
  is easier to talk about ("Ana's column is second").
- Used everywhere the Schedule lists techs: Day columns, Week rows, Whose schedule pills (with
  Everyone last), the Move sheet's tech list and Plan Week, and Today's Whose Day pills.
- Saving writes only the places that changed (core `scheduleOrderWrites`), 1 to n top to bottom.

## The control

- **Reorder Techs**, a round 44 pt icon button (up and down arrows) in the link color, named
  "Reorder Techs" for screen readers (and as its tooltip on a computer), never a row of its own
  (owner, 2026-10-21: "shouldn't take up so much space"); owners and admins only, and only when
  the shop has two or more active techs and the person sees everyone's jobs:
  - Phones (mobile website, iPhone, Android): at the end of the Whose schedule pills.
  - Desktop website: in the date row, after Day / Week / Month.
- It opens a sheet titled **Reorder Techs**: Cancel at the left, **Done** (bold) at the right, a
  one-line help ("Drag techs into the order the Schedule and Today show them."), and the active
  techs as an inset grouped list. Each row: the tech's color dot, their name, **Move Up** and
  **Move Down** arrow buttons (the visible alternative to dragging), and a grip at the trailing
  edge.
  - Website: drag the grip with a mouse or a finger; with the grip focused, the arrow keys move
    the row.
  - iPhone: `List` in edit mode with `.onMove` (the system's reorder grip); Move Up and Move
    Down are also accessibility actions.
  - Android: the grip and drag of Today's Reorder; Move Up and Move Down are also accessibility
    actions.
- **Done** saves for the whole shop (website: a server action; phones: through the sync layer,
  row and outbox together) and the Schedule shows the new order at once, with "Order saved." in
  the banner. **Cancel** discards the changes.
