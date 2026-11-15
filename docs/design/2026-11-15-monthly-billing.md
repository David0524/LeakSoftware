# Monthly Billing: Send All, Charges, Invoice Day

Owner, 2026-11-15, passing on a pool service shop's texts: "Is there currently a way to invoice
all service customers at once without having to do each one individually?"; "we should add a
send invoice button that allows them to invoice all customers"; "They'll need a way to add extra
charges for each customer like if they cleaned their filter or cleaned the salt cell, or replaced
any parts that month like a skimmer basket or something. Then send all at once"; and the owner's
own question, "if they should be able to set the invoice date when setting up a new recurring
job". Owner: "add all additional features ... How we build this is your call."

Same screens, wording and behavior on the desktop website, the phone website, the iPhone app
and the Android app. Pool care shops only (hidden for Leak Detection only, like Maintenance to
Bill).

## What already existed

- Each month, one **draft** invoice per customer: a "Pool service, October" line per plan, priced
  regular cleanings, and (when the shop charges) chemicals. The daily run drafts last month on
  the 1st; Invoices › Maintenance to Bill drafts any month by hand.
- Each draft was then opened and sent **one at a time**. That is the problem.
- A one-off filter clean or a new skimmer basket had no place on a visit: the office had to
  remember it and add a line to that customer's draft by hand.

## 1. Charges on a visit (techs and office)

The person who replaced the skimmer basket is the one who knows, so the charge is added on the
visit, in the field, offline like everything else on a visit.

- A maintenance visit's Checklist tab gets **Charges**, after Regular Cleanings and before the
  checklist (inset grouped list). A row per charge: name, "1 × $24.00", the amount; Remove (swipe
  on phones, with the row's button as the visible alternative). Then an **Add Charge** row.
- **Add Charge** opens a sheet: the shop's price book (search; Service and Repair items, not
  chemicals, which have their own Added Chemicals), tap an item, then **Quantity** (− and +,
  starting at 1) and **Add**. Below the list, **Custom Charge**: Description and Price, then
  **Add**.
- Footer: "Billed on Jane's October invoice." Once that invoice is sent: "On invoice #1042,
  sent Nov 1." and the charges can't change (as chemicals).
- Anyone on the team adds and removes charges (techs too), on visits they can see. A price book
  item's price is the server's (copied when the row arrives, as chemicals); a custom charge keeps
  the price typed.
- Billing: each charge is its own line on the customer's monthly invoice, after the plan and
  cleaning lines: "Replace skimmer basket, Oct 14", quantity × price, taxed as the item. A charge
  on a visit already on a draft joins that draft at once; one added after the month's invoice
  was sent goes on next month's (as chemicals). Voiding frees them.
- Table `visit_charge` (synced, company-scoped, rows like `chemical_addition`).

## 2. Monthly Billing: review, add, Send All (owners and admins)

**Invoices › Monthly Billing** (renamed from Maintenance to Bill): one row per month that has
drafts or visits not yet on an invoice: "October 2026" · "38 to send · $5,912.00" (or "3
customers not invoiced yet"). Tapping opens a pushed page.

**October Billing** (large title; back to Invoices), top to bottom:

1. Subtitle: "38 to send · $5,912.00".
2. If visits aren't on an invoice yet: a card, "3 customers aren't invoiced yet." (with "2 are
   billed on their invoice day, Nov 15." when that's why) and **Create Invoices** (secondary).
3. Segmented control: **To Send 38 | Sent 2**.
4. **To Send**: a row per draft: the customer (semibold), what's on it ("Pool service ·
   Replace skimmer basket · 1 more"), and how it will go: the email, "Text (555) 123-4567" when
   there's no email and the shop has texting, or "No email or mobile number" in orange. The
   total on the right. Tapping a row opens the customer's sheet:
   - Title: the customer; "October · $164.00".
   - The lines, each with Remove.
   - **Add Charge**: the same price book picker as on a visit (an item and quantity, or a
     custom description and price); it adds a line to this invoice.
   - **Open Invoice** for everything else (discount, due date, note).
5. **Send 38 Invoices** (filled blue, full width on phones). Footer: "Each goes by email, or by
   text from your shop's number when there's no email. Customers without either stay here."
6. **Sent**: the month's sent invoices with their status (Sent, Paid, Overdue) and total.

Send asks first (an alert; it can't be undone): "**Send 38 invoices?**" / "Each customer gets
their October invoice now: 36 by email, 2 by text." (+ " 1 without an email or mobile number
stays a draft.") with **Cancel** and **Send**. While it runs the button reads "Sending…"; after,
a notice: "Sent 38 invoices." or "Sent 36 invoices. 2 didn't go." with each that didn't and why
(the row stays in To Send with the reason). Sending is the existing per-invoice send (with the
month's service report for Monthly-report shops, the send-once guard, the email allowance), run
on the server: `POST /api/invoices/month/{month}/send` for the apps, a server action on the
website.

## 3. Invoice Day (owner's question)

When a customer's monthly invoice is made.

- **Settings › Payments › Monthly Invoices › Invoice Day**: "1st" to "28th" of the next month
  (a Choice list), default the 1st. Footer: "Each customer's invoice for the month is drafted on
  this day of the next month, ready to review and send. A plan can use its own day."
- **Per plan** (New Job when it repeats, and Edit Plan): **Invoice Day**, under Price per Month:
  "Shop Default (1st)", then 1st to 28th. A customer with several plans is billed on the
  earliest.
- The daily run drafts last month's invoice for each customer on their day (not all on the 1st).
  **Create Invoices** on the month's page drafts everyone now, whatever their day.
- Days run 1 to 28 so every month has them. An invoice is dated when it's sent.

## Not now (proposed for later)

- **Sending by themselves on the invoice day.** It needs the server to send as the shop
  (today every send is by a signed-in person). Send All is one tap; if shops ask, this is next.
- Billing in advance (this month's service on the 1st) and anniversary billing periods.
- Charges on the customer's visit report.
