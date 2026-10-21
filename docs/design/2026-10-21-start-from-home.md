# Start the day from home or from the shop

Owner, 2026-10-21: "Techs/owners need to be able to set if they start their day from home or
from the shop." Built on all four platforms with the same words and behavior.

## The setting

- **Field:** each team member has **Start My Day From**: **The Shop** (the default) or
  **Home**.
- **Where it's set:**
  - Techs set their own in Settings › My Profile (website: More › My Profile).
  - Owners and admins set anyone's in Team › the person's profile.
- **Choosing Home:** shows a **Home Address** field, with the same address suggestions as a
  pool's address. It's looked up on the map the same way, through `locatePropertyWith`'s free
  lookups first, and shows the not-on-map warning if it isn't found.
  - Until the address is found, the day starts at the shop. The setting says "Starting from the
    shop until the address is found on the map."
- **Footer:** "Routes, drive times and Optimize start and end here."

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
  - `routeStart(member, shop): { at: LatLng | null; label: "home" | "shop" }` (home only when
    `start_from` is `home` and `homeMapStatus` is `found`);
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
