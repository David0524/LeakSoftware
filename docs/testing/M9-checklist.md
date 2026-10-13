# M9 checklist: invoicing and payment

M9's "done when" is the handoff's definition of done, end to end in Stripe test mode. The
website part runs automatically (`apps/web/e2e/invoices.spec.ts`, in CI against Supabase in
Docker, with the signed webhook events Stripe would send). The steps below need a phone and a
real Stripe test account.

## Before you start

- The dev database has the M8.5 and M9 migrations (`pnpm db:deploy -- --seed`; needs the
  Supabase access token in the session's network secrets).
- The website has `APP_BASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, and (for email) `RESEND_API_KEY`. See `M8-checklist.md` →
  "Turning on payments" for the Stripe and webhook setup.
- The phone build has `EXPO_PUBLIC_API_URL` pointing at the website.

## The whole job, as a tech (definition of done)

With no signal at the pool (airplane mode):

1. Open a detection job with a detection fee. Work the checklist (verdicts, "where"), add a
   pressure test, photos, and a finding.
2. **Report** tab → collect the customer's inspection signature.
3. **Quote** tab → build a quote from the finding → **Customer Signs Now**.

Back online (airplane mode off):

4. The job syncs. **Report** tab → **Write Draft** → read and edit it → **Send by Email** (or
   Text). Open the customer's email: the report link opens and the PDF is attached.
5. Open the quote link on a phone: it shows **Accepted**. Press **Pay Deposit** and pay with
   `4242 4242 4242 4242`. The page shows "Deposit received".
6. On the office job page, open the **Repair job**; on the phone, start it (**Start Job**).
7. Phone, repair job → **Invoice** → **Create Invoice**. It lists the quote's work and the
   deposit as a credit. **Send by Text**: the share sheet opens with the payment link.
8. Open the link on a phone: balance due is the total minus the deposit. **Pay** with a test
   bank account (**Test Institution**). The page shows "processing"; when Stripe sends the
   next event it becomes **Receipt · Paid in Full**, and the customer gets a receipt email.
9. Office: the repair job shows **Paid**; **Invoices** lists it as paid; **Export Payments**
   downloads a CSV with the deposit and the payment.

## Also check

- Detection fee only: phone, detection job → **Create Invoice** bills the fee. In the office,
  add a line, set a due date, then **Send by Email**; the customer and their other emails get it.
- A check: office → **Record Payment** for part of the balance → **Partly paid**; the rest →
  **Paid**, and the receipt email goes out.
- **Void Invoice** (owner, no payments): the customer's link says it was canceled; the job can
  be invoiced again.
- **Download PDF** on the invoice and on the receipt.
