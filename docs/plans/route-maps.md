# Schedule: day maps and building routes from scratch

Owner, 2026-10-20, from a photo of PayThePoolMan's routing screen: "Looks awful but it does have
the maps up top for route building. This owner uses the maps all time. We need incorporate
something like that. We also need to be able to build routes from scratch. Where you have jobs
for the week and it auto calculates the best way to route them."

Status: plan, waiting on the owner. Every platform gets it: the website (desktop and phones), the
iPhone app and the Android app.

## What PayThePoolMan does

A tech's week is a row of day maps (Monday, Tuesday, Wednesday…), each with its stops as pins and
two buttons, Enlarge and Optimize. Below is the selected day's stop list in order. On the left,
"Customers to add" lists active pool customers who are on no day yet, to drop onto one. It's a
tool for a pool route: which day each customer is serviced on, and in what order.

## What we have now

- Schedule shows a day or a week of stops per tech, with drive times between them (Mapbox
  Matrix), drag and drop, Move…, and **Plan Route**, which re-orders and re-times one tech's day
  for the least driving. Started jobs, times the customer was told and two-tech jobs stay put.
- Jobs without a time wait in **Needs a Time**.
- A maintenance plan repeats on set weekdays (or weekly, every 2 weeks, or monthly), and its visits
  are made from the plan.
- No maps anywhere: addresses open the phone's maps app.

## The idea

### 1. A map for each day

- **Week view, desktop:** a map above each day's column, with the tech's stops as numbered pins in
  route order and the shop as its own pin. Tapping it opens a large map of that day (Enlarge),
  with the route drawn between stops and the stop list beside it. Tapping a pin highlights its
  card; hovering a card highlights its pin.
- **Day view and phones:** one map at the top of the day, collapsible to a strip, so the list
  still opens near the top. Tapping it opens the large map as a sheet.
- **Every day map has Plan Route** (our name for Optimize), as the day already has.
- Pins use the stop's type color, a number, and a ring on the stop you're on. A stop that's "Not on
  map" is listed under the map, not guessed.

### 2. Plan Week: routes from scratch

**Plan Week** on the week view takes a tech's (or every tech's) jobs for the week and puts them on
days and in order for the least driving, then shows the result for the office to keep or undo.

- **It places:** jobs in Needs a Time for that week, and scheduled jobs that haven't started and
  whose time the customer wasn't told.
- **It leaves alone:** started and finished jobs, told times, two-tech jobs, and maintenance visits
  (they follow their plan's weekdays; see decision 3).
- **It keeps to:** the shop's work hours and each job's length, each tech's days off, and a job's
  "not before" or due date where it has one.
- **How:** group the week's jobs into days by area (nearby stops on the same day), then order each
  day with the same matrix Plan Route uses. Days with room take the leftovers. A summary says what
  changed ("Moved 9 jobs · 3 hr 10 min less driving") with **Undo**.

### 3. Building pool routes (which day each customer is serviced)

The PayThePoolMan screen is mainly this: a "Customers to add" list, and dropping a pool customer
on a weekday sets their service day. For us that's the plan's weekday.

- A **Routes** view (Schedule → Week → Routes, owners and admins) shows each tech's weekdays as
  maps with that day's plan customers, and **Customers to Add**: active customers without a plan
  day, or with a plan and no tech.
- Drag a customer onto a day (or tap and pick a day) to set the plan's weekday and tech; their
  visits from then on follow it.
- **Suggest Days** does it automatically: it spreads the customers across the tech's working days
  by area and evens out the stops per day. Nothing changes until the owner presses Keep.

## Decisions for the owner

1. **Maps provider.** Recommended: Mapbox, which we already pay for lookups and drive times. The
   website uses Mapbox's map; the iPhone uses Apple Maps (free and native); Android uses Mapbox's
   map image with numbered pins, and the large map opens Mapbox in the app. The free Mapbox tier
   covers 50,000 map loads a month; after that it's about $5 per 1,000. Other choice: Google Maps
   everywhere (one look, a new paid account and key).
2. **Plan Week moves jobs between days** (and, if you pick "every tech", between techs).
   Recommended: yes, with one Undo for the whole change, and never for told times or started jobs.
3. **Pool routes (which weekday each customer gets) are part of this.** Recommended: yes, as the
   Routes view with Customers to Add and Suggest Days, owners and admins only. It changes plans'
   weekdays, so visits already made for the coming weeks move to the new day.
4. **Day maps on phones are collapsible**, open by default on the Day view and closed on the week
   strip. Recommended: yes.
5. **Plan Week's limit.** Mapbox's matrix takes 25 points a call, so a big week is planned in
   area groups. Recommended: up to 150 jobs a week per run; more says so and plans the first 150.

## Order of work

1. Day maps on Schedule (week and day, all platforms), with Enlarge and Plan Route.
2. Plan Week with Undo, core logic in packages/core with Swift fixtures.
3. Routes: Customers to Add, set a plan's weekday and tech by dragging, Suggest Days.
