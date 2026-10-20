# Today: a hero card for the stop you're on

Owner, 2026-10-20: "I feel like the Today page needs a hero showing the current job and some info
like that. I'm not sure exactly but the live activity has some good info that we can take from.
Plan something out."

Status: approved 2026-10-20 (all five recommendations). Every platform gets it: the website (desktop and phones), the
iPhone app and the Android app.

## The idea

Today opens with one card at the top, **Now**, for the stop the tech is on. It's the Live Activity
brought into the app: the same stop, the same words, the same big figure, and the actions for that
moment. A glance at the top of Today answers "where am I, what's next, what do I tap". The list of
stops stays below it.

The card and the Live Activity come from one shared rule (`todayHero` in packages/core, built on
`liveStopContent`), so the Lock Screen, Android's ongoing notification and the Today card always
agree.

## What the card shows, by moment

The four moments are the Live Activity's own. There's no timer or countdown (owner, 2026-10-19).

| Moment | When | Big figure | Main button | Also |
| --- | --- | --- | --- | --- |
| Up next | Before On My Way | Scheduled time, "9:00 AM · Scheduled" | **On My Way** | Call, Directions |
| On the way | After On My Way | Arrival time, "9:42 AM · Arriving" | **Start Job** | Call, Directions |
| At the pool | Job started | Checklist, "4 of 9 · Checklist" | **Open Checklist** | Mark Complete (or Complete Visit), Call |
| Done | Just completed, for a minute | ✓ "Smith done" | **On My Way** to the next stop | |
| Day done | Every stop done | ✓ "All 6 stops done" | (none) | Back at the shop by 4:10 PM |

Every moment also shows:

- **The customer's name**, large (Barlow, as on the Live Activity). Tapping it opens the job, as
  the stop rows do now.
- **The job type and stop count**: "Leak detection · Stop 3 of 7".
- **The address**: tapping it opens directions. If it's not on the map, it shows "Not on map"
  (2026-10-20).
- **Access notes on one line with a key**: gate code, which gate, dogs. The full notes are on the
  job.
- **Cleanings due on the visit**, as the icons the stop rows use now.
- **"Next: Jones at 10:30 AM"**.
- **The day's progress**: one segment per stop (done, this one, still to come). This replaces the
  Live Activity's single bar, which doesn't say how many stops there are.

```
┌──────────────────────────────────────────────┐
│ Up next · Stop 3 of 7                        │
│ Cole Izhaky                         9:00 AM  │
│ Leak detection                     Scheduled │
│ 1420 E Palm Ln, Phoenix  ›                   │
│ 🔑 Side gate code 4821. Dog in yard.         │
│ Next: Jones at 10:30 AM                      │
│                                              │
│ [ On My Way ]                     (☎) (➤)    │
│ ■■□□□□□                                      │
└──────────────────────────────────────────────┘
```

## The list below it

- **The stop on the card** stays in the list, marked "Now", and is shorter there, because the card
  already shows its details.
- **Done stops** fold into one row, "3 done", that opens to show them. The day reads from where the
  tech is, not from 7 AM.
- **Drive times between stops, "back by", the weather and the tech picker** stay as they are.

## Layout

- **Phones** (website on a phone, iPhone, Android): the card is the full width under the large
  "Today" title, and its main button is within thumb reach. The one-handed Next Step bar
  (2026-10-20) doesn't repeat the card's main button while the card is on screen.
- **Desktop website**: the card spans the top of the page. Name, details and next stop sit on the
  left; the figure and buttons sit on the right.
- **Accessibility**: the card reads as one item with the Live Activity's spoken sentence, and its
  buttons follow. Text scales with Dynamic Type. Color is never the only cue: each progress
  segment also says done or to come to VoiceOver and TalkBack.

## Whose day

- **Techs** see their own card.
- **Owners and admins** who pick a tech in "Whose day" see that tech's card. On My Way and Start
  Job are hidden there, since those are the tech's to press; Call and Directions stay.

## What it needs

1. **A shared rule in core**, `todayHero(stops, today, onMyWay, now)`. It returns the moment, the
   job, the Live Activity's content, the next stop and the progress segments. The iPhone gets it
   too, with fixtures. The Live Activity and Android's notification move onto it, so all three
   pick the same stop the same way. Today that logic is in two places: apps/mobile `LiveStop.tsx`
   and the Swift `LiveStop.swift`.
2. **"On the way" known everywhere.** Right now only the tech's phone knows it pressed On My Way
   (it's kept on the device). The website can't tell "up next" from "on the way", and neither can
   the office. Decision 2 below.
3. **Web, iPhone and Android cards**, built from the same rule and wording.

## Decisions for the owner

1. **Card color.** Recommended: the water blue of the Live Activity, white text, white main button
   with blue text. It reads as the same thing as the Lock Screen and is the one bold block on
   Today. The other choice is a white card with blue accents, like the rest of the app.
2. **Record On My Way on the job.** Recommended: yes. The job keeps when On My Way was sent and the
   arrival time, synced like the rest of the job. The website's card and the office then see "On
   the way, arriving 9:42", and a second phone shows it too. Otherwise the website's card can only
   say "Up next" until the job starts.
3. **Fold done stops into "N done".** Recommended: yes.
4. **Owners viewing a tech's day see that tech's card,** without On My Way or Start Job.
   Recommended: yes.
5. **Drive time on the card before leaving**, such as "14 min drive" under the address. It's a
   fixed estimate, not a countdown. Recommended: yes.

## Order of work

1. Core `todayHero` with tests and Swift fixtures. Move the Live Activity and Android's
   notification onto it. If decision 2 is yes, add the On My Way columns to the job (migration,
   sync, pgTAP).
2. The website card (desktop and phones), the "N done" fold and the "Now" row, with a Playwright
   test for each moment.
3. The iPhone and Android cards, in the same piece of work.
