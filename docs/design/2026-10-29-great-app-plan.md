# Plan: the five great-app changes (2026-10-29)

Owner: "1. Yes 2. Yes 3. Fix 4. Fix 5. Yes. Plan first." Each change ships on all four platforms
(desktop website, phone website, iPhone, Android) with the same words and behavior. Decisions
the owner can change are marked **Choice**, with the recommendation first.

## 1. New Job in 20 seconds

New Job shows only what a phone call needs. Everything else sits behind one **More Details**
row that opens in place. Nothing is removed; every field still saves the same way.

```
New Job                              New Job (Repair)
Accepted quotes make their own …
CUSTOMER   [ New | Existing ]        … same Customer, Address, Visit …
  Name                               VISIT
  Phone                                Job   [Service|Repair|Leak|Inspection]
  Email                                What do they need?  [Pump motor ($450) ⌄]
ADDRESS                                Price ($)  450.00
  Street address  (autofill)
  City   State  ZIP
VISIT
  Job   [Service|Repair|Leak|Inspection]
  When  [Scheduled | Not Yet]
  Date  Start  Hours
  Tech
FROM THE CUSTOMER                    (the shop's own booking questions)
  Why they called
┌──────────────────────────────────┐
│ More Details                   ⌄ │  ← one row, closed
│ Pool type, spa, gallons, shape,  │
│ access notes, second tech, price │
└──────────────────────────────────┘
[ Create Job ]
```

- **Stays in view:** New/Existing, name, phone, email, address, job type, when, tech; a repair's
  "What do they need?" and its price; a maintenance plan's repeat fields; the shop's booking
  questions (they're the shop's own call script).
- **More Details:** other emails, pool type, has a spa, gallons, pool shape, access notes, second
  tech, detection or inspection price (already filled from the price book), notes for the tech.
- **It opens by itself** when a restored draft or an error is inside it, so nothing typed is
  ever hidden. Its second line lists what's filled when something is ("Price $649 · Pool type
  Gunite").
- **Existing customer:** picking one fills the pool details as today; More Details stays closed.
- **Choice:** Email stays in view (reports go by email) **(recommended)**, or moves into More
  Details.
- Website: the fields stay in the form when closed, so drafts and Create Job work unchanged.
  iPhone and Android: the form keeps every value while closed.

## 2. An empty Today shows what's next

When the chosen person has no stops today, Today shows their next working day with stops,
looking up to 14 days ahead.

```
Today
Thursday, October 30

Nothing on your route today.
┌──────────────────────────────────┐
│ Tomorrow                         │
│ 4 stops · first at 8:00 AM       │
│ Grace Holloway, Riley Rivera,    │
│ and 2 more                       │
│               [ See Tomorrow ]   │
└──────────────────────────────────┘
```

- The heading says "Tomorrow", or the day ("Monday, Nov 3") when it's further out. The button
  says "See Tomorrow" or "See Monday" and opens the Schedule on that day.
- It follows the person chips (Me, a teammate), like the rest of Today.
- Nothing in the next 14 days: "Nothing on your route today. Open the schedule." as today.
- One shared rule in core (and its Swift port, checked against core's fixtures), so all four
  platforms pick the same day.

## 3. Edit Finding: the pool shape only until it's set

- **The pool already has a shape** (including a drawn one): the finding editor shows the pin
  diagram only. No shape tiles, no Has a Spa. The shape is changed with Edit Pool Shape on
  Findings, as now.
- **No shape yet:** the tiles and Has a Spa show as today, with "Pick one so the diagram matches
  the pool." They stay for the rest of that edit, so a wrong tap can be changed right there.
- This also ends the accidental clear: tapping the chosen tile can no longer wipe a pool's shape
  from inside a finding.

## 4. The job page's forward step leads; backward moves go in a ••• menu

- A **•••** button joins the job page's top bar (iPhone: the navigation bar; website and
  Android: beside the job's title). It holds **Move Back to Scheduled**.
- **Choice:** **Unschedule** moves into it too **(recommended)**: it's the other backward step,
  and today it's the top button on every scheduled job on a phone. Or it stays where it is.
- What stays in view: Start Job, Complete Job, Reopen Job, Reopen Visit. Cancel Job stays at the
  end of Details (it's destructive, and the 2026-10-14 review put it there).
- When the menu would be empty, there's no ••• button.

## 5. Customers sorts and filters the way Jobs does

```
iPhone                               Website (phone)                 Website (desktop)
Customers         ⊜  ↑↓  ✉           Customers                ✉      Customers
[ Name, phone, or email ]            [ Name, phone, or email     ]   [ search … ] [Search] [All Customers (302) ⌄] [Name A–Z ⌄]
Maria Alvarez                 ›      [All Customers (302) ⌄][Name A–Z ⌄]
```

- **iPhone:** Show and Sort become the same two toolbar menus Jobs uses (filter and sort icons),
  beside Email Customers. The filter icon fills in when Show isn't All Customers.
- **Website and Android:** the two labeled pickers become the two compact menus Jobs uses, side
  by side on one row under the search field (on desktop, on the search row).
- Counts stay in the Show choices ("No Plan (12)"). Picking applies at once, as now.

## Order and checks

1. Items 3 and 4 (small, independent), then 5, then 2 (core rule + four screens), then 1 (the
   largest form change).
2. Tests: core rule for item 2 with Swift fixture parity; Swift and Android unit tests for the
   menu contents and the Today card; website e2e updated where tests click the moved buttons
   or the labeled pickers, and new e2e checks for More Details (a draft inside it opens it) and
   the Today card.
3. Before going live: phone and desktop screenshots of each changed website screen, and the
   iPhone CI screenshots for each changed screen (New Job closed and open, Today empty, Edit
   Finding with and without a shape, the ••• menu, Customers), looked at. Then the usual: CI
   green, merge, TestFlight.
4. One commit per item, each shipped as soon as its CI is green.
