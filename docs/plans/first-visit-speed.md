# First visits: where the time goes, and two options (2026-10-16)

Owner, 2026-10-16: "I still don't like the loading times in between screens." Revisits are now
instant (screens kept for a minute). This measures first visits and proposes the next steps.
Nothing here is built yet.

## Measured

Each office page was loaded as the demo owner on a local production build with `DB_TIMING=1`,
which logs every database call with its start time. From the cloud machine each call costs
150 to 300 ms (a proxy in the way); in production, website and database sit in the same region
(Vercel `pdx1`, Supabase `us-west-2`), and the live site showed 0.05 to 0.45 s of server work per
page.

What matters is how many calls wait on each other (steps), not how many there are:

| Page | Calls | Steps | Steps in order |
|---|---|---|---|
| Today | 9 | 3 | who's signed in → day's jobs, team, company, number, unread count, billing (together) → drive times |
| Schedule | 10 | 3 | who's signed in → two weeks of jobs and the rest (together) → drive times |
| Jobs | 7 | 2 | who's signed in → jobs and the rest (together) |
| Messages | 7 | 2 | who's signed in → conversations and the rest (together) |
| Dashboard | 6 | 2 | who's signed in → the dashboard query and the rest (together) |
| Customers | 7 | 2 | who's signed in → customers and the rest (together) |

Every page already runs its own queries together. What's left is the first step, which every
page pays, and the drive-time step on Today and Schedule. The weather on Today loads on its own
and never holds up the stops.

## Option A: skip the "who's signed in" step (every page, about one round trip)

`getOffice()` looks up the person's companies and name before any page query can start, because
those queries need the company id.

- Keep the person's company list in a short-lived server cache (30 to 60 seconds, keyed by user
  id; the user id comes from the verified session token). Pages start their queries at once.
- Data stays safe: every query still runs as the person, and row security checks membership on
  each one, so a removed teammate sees nothing even while the cache holds their old list.
- The catch: for up to a minute after a role change, the screens could show the old role's
  buttons. Owner-only actions would keep checking the role fresh (not from the cache), since
  some of them, like buying a number, use the server's own access.
- Needs `SUPABASE_SERVICE_ROLE_KEY` on Vercel (already needed for texting).

## Option B: drive times in the same step as the jobs (Today and Schedule)

Drive times need the jobs' map locations, so they're fetched after the jobs. A database function
that finds the day's jobs and returns their cached drive times would answer in the jobs' step.
Needs a migration. Saves one round trip on Today and Schedule only.

## Recommendation

After launch, not before: A is the bigger win and touches sign-in on every page, so it should
ship with time to watch it. B is smaller and safe, and can go any time.
