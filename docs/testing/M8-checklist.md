# M8 checklist: quotes and deposits

## Try it now (website, no Stripe needed)

1. On the phone, open a job → **Quote** tab → **Start Quote**. Under each finding, tap a price
   book item to add it; add a custom line; change a quantity or price; add a discount. Works in
   airplane mode.
2. **Customer Signs Now** accepts it on site (works offline; it accepts when it syncs).
3. Or **Send Quote** (phone, needs the server) or **Send Quote** on the office job page under
   **Quotes**, then open the customer link on your phone: the quote, totals, deposit, **Accept
   Quote**.
4. After accepting, the office job page links to the new **Repair job**. Open it and use
   **Schedule** to pick a tech and time.

## Turning on payments

1. Create a Stripe account and stay in **Test mode**. Turn on **Connect**.
2. In the hosting settings add `STRIPE_SECRET_KEY` (sk_test_…) and `SUPABASE_SERVICE_ROLE_KEY`.
3. In Stripe → Developers → Webhooks, add an endpoint `https://<your site>/api/stripe/webhook`
   listening to **events on Connected accounts**: `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
   `account.updated`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
4. In Tidemark: **Settings → Payments and Deposits → Set Up Payments** and finish Stripe's
   test onboarding.
5. Accept a quote on your phone, press **Pay Deposit**. Card: `4242 4242 4242 4242`, any future
   date and CVC. Bank: choose **Test Institution** and a successful test account; it shows
   "processing" and turns paid when Stripe sends the next event.
