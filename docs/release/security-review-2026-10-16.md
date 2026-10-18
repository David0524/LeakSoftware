# Security review: company texting and this week's changes (2026-10-16)

Scope: Twilio webhooks and signatures, the texting server code and phone API, the Messages
pages and unread, sign-up with the package choice, the `/home` landing, and the texting
migration's RLS and storage policies. No Critical or High findings.

## Fixed

| Severity | Finding | Fix |
|---|---|---|
| Medium | Open redirect: a signed-in person opening `/sign-in?next=//evil.com` was sent to evil.com; the action's check let `/\evil.com` through. | One check for both (`safePath` in `packages/core`): same-site paths only, no `//`, backslashes, or control characters. Tested. |
| Medium | Taking a number bought it before checking the shop had none: a double-click or two owners at once bought numbers nobody uses, billed monthly. | The shop's line is reserved first (one per shop, enforced by the database), then bought; a failed purchase lets the reservation go. |
| Medium | Texts and calls could go to any country on Sundeck Pro's Twilio bill, from a free trial. | Texts, calls, and each person's mobile number are US and Canada (+1) only (`isUsNumber`). Tested. |
| Medium | Two webhooks at once from a new number (a text and its picture) could both create the conversation; the second failed and that message was lost. | On the duplicate, the existing conversation is used. |
| Low | Sends and calls were attempted from a pending line (a shop's own number, not set up yet). | Only an active line sends or calls. |
| Low | The phone API took the pictures list as given (wrong shapes caused errors; any file type). | Checked: up to 10, images only. |
| Low | Texts from short codes or named senders failed the webhook. | Ignored (nothing to file them under). |
| Low | After-hours calls without a voicemail stayed "ringing" and never reached the inbox. | Marked missed and unread at once; a recording turns it into a voicemail. |

## For the owner

- **Twilio geo permissions:** in the Twilio console, allow SMS and voice to the US and Canada
  only. The code now refuses other numbers, and this is the second lock.
- **Who may take a number:** any owner on a free trial can buy a number on Sundeck Pro's account.
  Consider allowing it only on a paid subscription.
- **`APP_BASE_URL` must be set on Vercel.** Without it, links and Twilio callback addresses come
  from the request's host header. Set it to the site's address before launch.
- **Claiming an existing number** ("Or use your shop's number") saves any number as pending, which
  blocks another shop from using it until Sundeck Pro staff check it. Verify ownership before
  activating, and release claims that don't check out.
- **Per-tech visibility:** with "techs see only their own jobs", techs still see every
  conversation, including texts tied to other techs' jobs. Known and listed as not built.

## Not changed (low risk, noted)

- A delivery status that arrives before the send is recorded can be missed, leaving the text
  "Sending". Fix later by putting the row id in the status callback address.
- The private `texts` bucket has no size or type limit at the storage level (uploads are by
  signed-in members only, into their own shop's folder).

## Checked and safe

Webhook signatures (every Twilio route; timing-safe; signed against `APP_BASE_URL`), the
voicemail recording proxy (reads through the person's own access; nobody can set a recording id),
service-role use (only after an access check or a valid signature), the `.or()` filter on the job
page (built only from a database id and a normalized number), picture paths (own shop's folder,
checked twice), owner-only settings, and sign-up saving the package (as the new owner, under RLS).
