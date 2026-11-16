# Customer feedback and text reminders (2026-11-16)

Owner's competitor notes (Triton): thumbs up or down after a visit, a private complaint case for a
thumbs down, no review requests to customers with an open complaint, and multi-step reminders by
email and/or text. Migration `20261022004700_feedback_and_text_reminders.sql`, pgTAP
`894_feedback_and_text_reminders`.

## 1. Feedback screening

**Customer side (website only, no sign-in, the link's token).**
- "How did we do?" card under a sent report on `/r/[token]` (not in the PDF, not on a superseded
  report, only when the shop's Ask How We Did First is on), and on a new page `/f/[token]` that the
  review request email's links open (`?rating=up` or `?rating=down` shows that answer).
- Thumbs up: recorded, "Thank you! We're glad you're happy.", then **Leave a Google Review** (the
  shop's review link; no button when the shop has none). Thumbs down: **What went wrong?** text box,
  **Send**, saved privately as a complaint; "Thank you for telling us. {Shop} will be in touch."
- The email's links only show the answer. Nothing is recorded until the customer acts on the page
  (mail scanners open every link): a thumbs up from the email is recorded when they tap Leave a
  Google Review; a thumbs down when they Send.
- Written by the server with the service role (`submit_feedback`, `feedback_for_token`, granted to
  `service_role` only). Same answer twice (a thumbs up once per job, the same complaint text) is one
  row.

**Table** `customer_feedback` (company_id, customer_id, job_id, rating up/down, comment, status
open/closed, office_note, closed_by, closed_at). Registered in `app.sync_table` as manager read,
manager write (`status`, `office_note`), `device_sync` false (phones read it through
`feedback_list` / `feedback_open_count` / `set_feedback_status`, like the Dashboard). A trigger sets
`closed_by` and `closed_at` from the status change. A thumbs up is always closed and can't be
reopened.

**Office (all four platforms, owners and admins).**
- **Customer Feedback** list: segments **Open | Closed | Thumbs Up**, open complaints first, the
  open count under the title ("3 open complaints"). Tapping a complaint opens it: what they said,
  received date, links to the customer and job, a **Note** box, **Close** (or **Reopen**).
  Website `/feedback`, `/feedback/[id]`; Android `/feedback` (complaint in a sheet);
  iPhone `FeedbackScreen` / `ComplaintScreen` (pushed).
- **Dashboard** card "Customer Feedback", value = open complaints, note "open complaints", opens
  the list.
- **Customer page**: a "Feedback" section (latest 5, **See All Feedback**), shown once the customer
  has said anything.
- Thumbs down notifies owners and admins (new notification kind `feedback`, "Customer complaints",
  "Customer complaint": "Rebecca Soto: The pool is still green."), once per complaint.
- Settings > Company and Branding > Reminders and Reviews: switch **Ask How We Did First** (default
  on). On: the review request email asks "How did we do?" with two links (We did great / Something
  went wrong) instead of the review link. Off: today's email with the review link.

**Review request rules.** No review request while the customer has an open complaint, nor on a job
where they already gave a thumbs up (they were shown the link then). Closing the complaint releases
the request if it is still inside its 14 days.

## 2. Text reminders

Settings > Company and Branding > Reminders and Reviews: **Send Reminders By** Email | Text | Both
(segmented), default **Email** (today's behavior). Stored `settings.reminders.channel`. Same days
and stop conditions as the emails (the database's `due_followups` decides what is due; a message is
claimed per channel by the unique index, so Both sends an email and a text once each).

A text goes only when the shop has an active company number (not pending), the customer has a US
mobile number, and the number hasn't replied STOP (`conversation.opted_out`). Customers who used the
email stop link (`marketing_opt_out`) get nothing on any channel. Sent through `sendCompanyText` as
the shop, so it is logged like other outbound texts (the conversation, `text_message` with the job)
and counts against the text allowance; plus a `message` row (channel `sms`) as the claim. Text:
"{Shop}: a reminder that $350.00 is still due on your invoice #1042. Pay online: {link}" (quotes:
"...about your quote #7 for $850.00. Review and accept it: {link}"). No "Reply STOP" line, because
the existing texting code adds none (carriers answer STOP and HELP themselves). The review request
is always email.

## For the owner to decide
- Should the email stop link also be a text opt-out? Built: yes (nothing goes to them), the safer
  reading.
- A thumbs up on the job suppresses its later review request email (they were already offered the
  link). Say if they should still get it.
- The report-page card shows only while Ask How We Did First is on; turning it off hides the
  complaint channel from the report page. A separate switch is easy if wanted.
- Native apps read feedback from the server (need a connection), like the Dashboard; syncing it to
  phones would make it work offline.
