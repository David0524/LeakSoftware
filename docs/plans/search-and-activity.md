# Search and Activity

Owner, 2026-10-20, after comparing navigation with other SaaS apps: "Ok add that search in" and
"Throw an activity feed in More. Consider tech's visibility rules. Maybe have a shortcut to it on
the owner's dashboard page." Everything else in the navigation stays as it is (no create-anything
"+", Customers and Invoices stay under More).

Every platform gets both: the website (desktop and phones), the iPhone app and the Android app,
with the same wording and behavior.

## 1. Search

### What it finds

One search across the shop, grouped in this order, at most 5 per group with **See All** (opens the
full list for that group):

| Group | Matches on | Row |
| --- | --- | --- |
| Customers | name, phone (digits only, any formatting), email | name · phone or email |
| Pools | street address, city | address · customer |
| Jobs | job number ("1038", "#1038", "Job 1038"), customer name | "Job #1038 · Leak detection" · customer · date |
| Quotes | quote number, customer name | "Quote #1012 · $975.00" · status |
| Invoices | invoice number, customer name | "Invoice #1028 · $375.00 due" · status |

- Case and accents don't matter; words match in any order ("ochoa sam" finds Sam Ochoa); each word
  matches the start of a word ("och" finds Ochoa, "hoa" does not). Numbers match exactly or as a
  prefix ("103" finds #1038). Phone search needs 4+ digits.
- Two characters before anything is searched. Results update as you type (debounced 200 ms).
- Deleted records never show. What a person can't open, they can't find: techs in a shop set to
  "Only Their Own" find only their jobs, those jobs' quotes and invoices, and the customers and
  pools the rest of the app already shows them (the existing visibility rules decide; search adds
  no rule of its own).
- Ranking inside a group: exact number match first, then name/word-start matches, then the most
  recent (jobs by scheduled date, quotes and invoices by created date).
- One shared rule in `packages/core` (`searchShop` or similar: normalize the query, match, rank,
  group, cap) used by the website and the Expo app, ported to Swift with fixtures.

### Where it is

- **Phones (website, iPhone, Android):** the search field at the top of **Jobs**, under the large
  title, where iPhone apps put search (`.searchable` on iPhone). It replaces the jobs-only search
  there: typing shows grouped results over the list; Cancel returns to the list. Placeholder:
  "Search customers, jobs, addresses".
- **Desktop website:** a search field in the header (before New Job), and **⌘K / Ctrl+K** from any
  office page opens it as a centered panel. Arrow keys move through results, Return opens one,
  Escape closes.
- **Phones search the phone's own database**, so search works offline (the synced rows already
  follow the visibility rules). The website searches the server.

### Before typing: Recent

The field, focused and empty, shows **Recent**: the last 8 records this person opened (customer,
job, quote, invoice), newest first, kept on that device only, with **Clear**. Signing out clears
it.

### Words

- No results: "No results for “{query}”." with "Check the spelling, or try a phone number or
  address." in secondary text.
- Offline on the website: the usual "Couldn’t search. Check your connection and try again."

## 2. Activity

A list of what happened in the shop, newest first: **More › Activity** on every platform, and an
**Activity** row on the owner's Dashboard (the latest 3 events, then **See All**).

### Events

| Event | Text (title · detail) | Opens |
| --- | --- | --- |
| A customer accepted a quote | "Quote accepted · Maria Alvarez, $975.00" | the job |
| A payment came in (deposit or invoice) | "Payment received · Maria Alvarez, $487.50" | the job |
| A customer signed a report | "Report signed · Maria Alvarez" | the job |
| A report or visit report was sent | "Report sent · Maria Alvarez" | the job |
| A job was completed / a visit done | "Job completed · Maria Alvarez, by Tony" | the job |
| A job was given to someone, or moved | "Job #1038 assigned to Tony" / "Job #1038 moved to Tue 9:30 AM" | the job |
| A customer texted the shop | "Text from Maria Alvarez · first 80 characters" | the conversation |

Each row: a round symbol for the kind, the title, the detail, and the time ("9:42 AM", "Yesterday",
"Oct 14") in secondary text; tapping opens what it's about. Grouped under day headers (Today,
Yesterday, then dates). 50 at a time, with more loaded on scroll.

### Who sees what

The same rules as everything else: an event about a job is visible exactly when that job is
(owners and admins always; techs per the shop's "Techs see" setting and their assignments); a text
is visible exactly when its conversation is. Enforced in the database (row security), not in the
screens.

### How it's recorded

A database table `activity` (company_id, id, kind, job_id, conversation_id, actor user id,
amount_cents, summary fields, created_at), written by the database when the event happens (triggers
on the rows that change), so it doesn't matter which platform or server path caused it, and phones
that were offline still produce events when their changes sync. Not synced to phones: it is read
from the server like the Dashboard (online only; offline the screen says "Activity shows when
you’re online.").

### Unread

A dot on More (phones) and on the Activity row when there are events since the person last opened
Activity (kept per person on the server). No push notifications beyond today's.
