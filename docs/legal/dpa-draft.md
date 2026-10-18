# Data Processing Addendum (draft, 2026-10-16)

**Draft for a lawyer to review before use.** Written so a shop can see plainly what Sundeck Pro
does with its customers' information. It describes what is built today; keep it in step
with `/security` and `/privacy`.

## 1. Who is who

- **The shop** decides what customer information to keep in Sundeck Pro and why. It is the
  controller of that information.
- **Sundeck Pro** stores and processes it only to run the service for the shop. It is the
  shop's processor (service provider).

## 2. What Sundeck Pro processes

Customers' names, phone numbers, emails, and pool addresses; service and inspection records,
photos, videos, voice notes, signatures, reports, quotes, invoices, and payment records;
texts, calls, and voicemails through the shop's number; the shop team's names and emails.

## 3. Only on the shop's instructions

Sundeck Pro uses the shop's information only to provide Sundeck Pro to the shop, as the shop uses
it. It does not sell it, use it for advertising, or combine it with other shops' records.

## 4. People

Only Sundeck Pro staff who need to, to support the shop or keep the service running, can reach
the shop's records, and they are bound to keep them confidential.

## 5. Security

As described on the Security page (`/security`), including: each shop's records walled off
in the database; owner and tech permissions; optional two-step sign-in, enforced by the
database; encrypted storage on phones and on the servers; encrypted connections; customer
links that expire after 180 days and can be turned off; card details handled only by Stripe;
an audit log of every change to a job.

## 6. Other companies (subprocessors)

| Company   | What for                                                  | Where         |
| --------- | --------------------------------------------------------- | ------------- |
| Supabase  | Database, sign-in, file storage                           | United States |
| Vercel    | Website hosting                                           | United States |
| Stripe    | Card and bank payments                                    | United States |
| Twilio    | The shop's phone number, texts, calls, voicemail          | United States |
| Resend    | Report, quote, and invoice emails                         | United States |
| Anthropic | Report drafts from inspection data, when the shop uses it | United States |
| Deepgram  | Voice notes to text                                       | United States |
| Mapbox    | Map locations and drive times                             | United States |
| Sentry    | Error reports (no customer details)                       | United States |

Sundeck Pro tells shops before adding a new company to this list.

## 7. If something goes wrong

Sundeck Pro tells the shop without undue delay, and within 72 hours of learning of it, if the
shop's information is accessed by someone who shouldn't have it, with what is known and what
is being done.

## 8. Requests from customers

When a shop's customer asks to see, correct, or delete their information, Sundeck Pro helps the
shop answer. The shop can edit and delete customers itself in Sundeck Pro.

## 9. When a shop leaves

The shop can export its invoices at any time. On request when it leaves, Sundeck Pro deletes
the shop's records within 30 days, except what the law requires keeping (payment records),
and confirms when done.

## 10. Checking

Sundeck Pro answers a shop's reasonable security questions in writing, once a year or after an
incident.

## Open points for the lawyer

- Governing law and liability caps (tie to the Terms).
- Whether to offer Standard Contractual Clauses (only if shops outside the US sign up).
- Backups: daily backups come with Supabase Pro (planned); state retention once it's on.
