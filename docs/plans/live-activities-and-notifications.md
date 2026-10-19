# Live Activities and notifications (owner, 2026-10-19)

> "Let's also get live activities and notifications for the apps. Make the live notification
> look beautiful please. Include our logo."

Every update ships on all four platforms; here the website has no lock screen, so it gets the
settings and sends the pushes, and the two apps show them.

## 1. The Live Activity: a tech's current stop

One activity at a time, for the stop the tech is on, started by the app itself (no push needed
to start it), so it works with no signal:

| Moment | What starts or changes it | Lock Screen | Dynamic Island (compact) |
| --- | --- | --- | --- |
| On My Way | Tapping On My Way (Today or the job) | **On the way to Smith** · 12 min · ETA 9:42 · Stop 3 of 7, with a progress bar along the drive | logo · 9:42 |
| At the pool | Start Job, or arriving | **At Smith** · since 9:45 (a running timer) · Checklist 4 of 9 · Next: Jones at 10:30 | logo · 0:12 (timer) |
| Done | Mark Complete / Complete Job | **Smith done** · Next: Jones · 18 min · then the activity ends after a minute (or moves to the next stop when On My Way is tapped) | logo · ✓ |

Design (Apple's Live Activity guidance): Sundeck Pro's mark at the top left on the brand
navy, the customer's name in Barlow (the brand display face), one large figure (minutes away,
or the time on site), a thin progress bar in the brand water blue, white text, and nothing
the tech must read twice. The expanded Dynamic Island shows the same with a Call button
and an Open Job link. Light and dark Lock Screens both read well (the activity sets its own
background). VoiceOver reads it as one sentence.

- **iPhone:** a widget extension (`SundeckLiveActivity`, ActivityKit and WidgetKit), built by
  xtool like the app (`xtool.yml` extensions). `NSSupportsLiveActivities` in the app's
  Info.plist. Updated by the app while it runs (stop changes, the checklist count, ETA); a
  push update channel later (section 3) keeps the ETA fresh when the app is closed.
- **Android:** the same as an ongoing notification ("Live Update" style on Android 16, a
  standard ongoing notification with a progress bar before): the logo as the small icon and
  large icon, the same lines and progress, Open Job and Call actions.

## 2. Notifications

| Event | Who | Text |
| --- | --- | --- |
| A customer texts the shop number | the job's tech, else owners and admins | Smith: "Gate is open, thanks!" |
| A job is assigned to you, or moved | that tech | New stop tomorrow 9:30: Smith, 123 Palm Ln |
| A quote is accepted | the tech who wrote it, owners | Smith accepted the $1,250 quote |
| A payment comes in | owners and admins | $657.30 paid by Smith (invoice 1042) |
| A report is signed on the customer's link | the job's tech, owners | Smith signed the report |

- Each person turns each kind on or off in More › Notifications (phone) and Settings ›
  Notifications (website). Default: all on.
- The phone keeps its push token on the server (a server-only `push_device` table: user,
  platform, token, last seen), like `feature_request`, not synced.
- The website sends them where these events already happen (the texting webhook, Stripe's
  webhook, quote and report acceptance, assignment changes) through Apple's push service
  (iPhone) and Google's (Android, through Expo's push service).

## 3. What's needed from the owner

1. **An Apple push key** (Apple Developer › Keys › new key with Apple Push Notifications
   service): the `.p8` file, its Key ID, and the Team ID, as Vercel environment variables
   (`APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`). Push needs the paid developer account (the
   approved one). Sideloaded test builds get pushes only with that account's signing.
2. **Android push:** a Firebase project's credentials uploaded to Expo (or `FCM_*` variables),
   for the Google Play app.
3. Which events to start with (the table above is the recommendation).

The Live Activity (section 1) needs none of these and is built first.
