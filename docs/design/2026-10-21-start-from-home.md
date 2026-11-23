# Start the day from home or from the shop

Owner, 2026-10-21: "Techs/owners need to be able to set if they start their day from home or
from the shop." Built on all four platforms with the same words and behavior.

## The setting

- **Field:** each team member has **Start My Day From**: **The Shop** (the default) or
  **Home**.
- **Where it's set:**
  - Techs set their own in Settings › My Profile (website: More › My Profile).
  - Owners and admins set anyone's in Team › the person's profile.
- **Choosing Home** (for the start or the end, see "End location"): shows a **Home Address**
  field, with the same address suggestions as a pool's address. It's looked up on the map the
  same way, through `locatePropertyWith`'s free lookups first, and shows the not-on-map warning
  if it isn't found.
  - Until the address is found, the day uses the shop at both ends. The setting says "Using the
    shop until the address is found on the map." (2026-11-23; it said "Starting from the shop …"
    while there was only a start.)
- **Footer:** "Routes, drive times and Optimize start and end at these places." (2026-11-23; was
  "… start and end here.")

## What it changes

- **Days start and end at home:** every route for that person on every day uses their start
  instead of the shop. This covers:
  - drive times and the first leg ("18 min from home");
  - "36 min back home";
  - Optimize, Plan Week and Suggest Days;
  - day maps, where the start pin is a house symbol labeled "Home";
  - Today's card and rows;
  - the Live Activity's drive estimate.
- **Wording:** the shop's wording stays for people who start at the shop ("from the shop",
  "back to the shop").
- **Two-tech jobs:** the job is routed from its main tech's start.

## End location

Owner, 2026-11-23, for Kevin: "He wants to make it so you can individually change the start and
finish location. This way he can do start location at the shop, and finish location at home." He
and one tech drive their own trucks: they start at the shop and finish at home.

- **Field:** **End My Day At**: **The Shop** or **Home**, right under Start My Day From, the same
  segmented control (Title Case segments, sentence-case footer), in the same places, on all four
  platforms. Words in core `START_FROM_COPY.endField` (Swift `StartFromCopy.endField`).
- **One home address:** the Home Address field shows when either is Home. Until it's on the map,
  both ends use the shop.
- **What it changes:** the last leg of every route goes to the end; the first still comes from the
  start:
  - the drive back and its words, by the end ("36 min back home", "36 min back to the shop");
  - day totals and overtime (`daySummary(…, end)`), Move and Suggest Times (`PlanContext.starts`),
    Optimize (`optimizeRoute(…, end)`: the order is chosen toward the end, so a day from the shop
    to home finishes near home), Plan Week (`WeekDay.end`), suggestSlots (`TechDay.end`) and
    Suggest Days (`suggestServiceDays({ starts })`);
  - day maps: when the ends differ, both pins (the shop, and a house labeled Home), the end last
    (`dayMapPins({ end, endLabel })`; core `routeOrder` draws the first start-tone pin as the start
    and the last as the end, so map addresses need no new code). The same place: one pin, as
    before. No start on the map (a shop with no location): no end pin either.
  - The "Routes start and end at the shop, which has no map location yet" notice also shows for
    someone who only ends at the shop.
- **Data:** `member_start.end_at text not null default 'shop' check (end_at in ('shop','home'))`
  (`supabase/migrations/20261022004900_end_day_at.sql`, tested by
  `supabase/tests/601_end_day_at.test.sql`), client-writable in `app.sync_table`. Rows that existed
  were set to `end_at = start_from`, so nobody's routes changed. Core `endAtOf(row)` reads a row
  without `end_at` (a phone's copy from before the column) as ending where it starts; the phones
  write `end_at` on every new row so their copy matches the server's.
- **Core:** `routeStart`/`startFor` return `{ at, label, end: { at, label } }` (`at`/`label` stay
  the start, so callers that only need the start are unchanged); `homeMapStatus` counts a home
  start or end; `usesHome(start_from, end_at)`. Every routing function takes the end as an optional
  last argument (or field) that defaults to the start, so a call without it behaves as before.
  Swift port and fixtures in `apps/ios/Tests/Fixtures/route-start.json`.

## Privacy

A home address is personal.
- It's visible to the person, and to owners and admins (for routing).
- Other techs never see it, and it never shows on a customer page, a report or a text.
- Maps show "Home", never the street.

## Data

Built in `supabase/migrations/20261012008000_start_from_home.sql`, tested by
`supabase/tests/600_start_from_home.test.sql`.

- **A table of its own, `member_start`, not membership columns.** Every member reads every
  `membership` row of their shop (read role `member`: the team list syncs to every phone), and
  the sync layer pulls whole rows, so home fields there would reach every tech's phone. One row
  per team member (unique `(company_id, user_id)` while not deleted); no row means the shop:
  - `user_id` (composite foreign key to `membership (company_id, user_id)`);
  - `start_from text not null default 'shop' check (start_from in ('shop','home'))`;
  - `home_address text` (one line, up to 400 characters);
  - `home_latitude`, `home_longitude` (`double precision`, like a pool's coordinates; both or
    neither);
  - `home_geocoded_address text`: the address the coordinates were found for, or last tried.
- **Who reads and writes it:** the person (their own row, while an active member) and owners
  and admins (everyone's). Nobody else, and no other shop. Registered in `app.sync_table` as
  `manager`/`manager` (what tenant isolation checks for teammates), synced to phones; the
  generated policies add "or your own row" (`user_id = auth.uid()` and a member). Writes go
  through the sync layer like any other row (row + outbox), so there is no `set_my_start()`
  function. `user_id` can't be changed after insert.
- **A changed address drops its coordinates** (a trigger), unless the same write sets new
  ones, so a day never starts at an old house.
- **Finding it on the map:** as a pool's (`locatePropertyWith`). The app writes `home_address`
  and clears the coordinates in the same write; the website then looks the address up as that
  person, `geocodeAddress` (free lookups first), comparing and saving
  `homeLookupAddress(home_address)` (core): found, it writes `home_latitude`, `home_longitude`
  and `home_geocoded_address`; not found, only `home_geocoded_address`, so the same address
  isn't tried again. Phones ask through `/api/locate` (`{ company_id, home_user_id }`).
- **Core** (`packages/core/src/route-start.ts`):
  - `routeStart(member, shop): { at: LatLng | null; label: "home" | "shop"; end }` (home only when
    `start_from` is `home` and `homeMapStatus` is `found`; `end` likewise for `end_at`, see "End
    location");
  - `startFor(techId, starts, shop)`: the depot every routing call uses for that tech;
  - `homeMapStatus(member)`: `found`, `missing` (show `START_FROM_COPY.pending` and the
    not-on-map warning) or null;
  - `startLegLabel(label)`, `backLegLabel(label)`, and `START_FROM_COPY` for the setting's words;
  - routing takes the start: `PlanContext.starts` (Optimize, Move, Suggest Times),
    `WeekDay.start` (Plan Week), `TechDay.start` (suggestSlots), `suggestServiceDays({ starts })`,
    and `dayMapPins({ depot: start.at, startLabel: start.label })`, whose start pin carries
    `home: true` (encoded `h:`) so maps draw a house labeled Home.
  - A two-tech job is placed by its main tech's route; each tech's own day still starts at their
    own start.
- **Swift:** a port with fixtures (`apps/ios/Tests/Fixtures/route-start.json`).
