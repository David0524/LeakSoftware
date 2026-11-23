# Promo and referral codes (2026-11-23)

Owner: "Kevin goes to this pool guy meet up thing once a month and there's like 20 pool companies
that attend it … I was thinking we offer a good deal to all of them. Like the 3 free months or maybe
even a slightly cheaper monthly rate to lock them in." "Yeah i think promo code might be best. And
we should be able to see what promo code they use. We could have it so if someone recommend the app
to a friend and they use their code, it gives both companies a free month or something." Later: "I
want a referral program where if someone refers another customer, they both get a month free …
Maybe the companies name actually?"

Website only (desktop and phone sizes). The iPhone and Android apps show no prices or purchases (App
Store rule 3.1.1, DECISIONS 2026-11-12), so codes aren't in them.

## One code box

The trial page (`/welcome`) and Settings › Sundeck Pro Billing take every kind of code in one field,
"Code" (placeholder "Enter code", hint "Referred by another shop? Enter its name.").
Any case; spaces and punctuation are ignored (`normalizeCode`, `app.normalize_code`).

| Kind | Made by | What it does |
| --- | --- | --- |
| Demo code (VIP26) | Rows in `app.access_code` | No card, no charge (unchanged) |
| Promo code | Staff, Admin › Codes | Free months and/or a percent off |
| Referral code | Every shop has one: its name | 1 extra month for the new shop; a free month for the referrer once the new shop pays |

`public.redeem_code(company, code)` (owners only) looks for a demo code, then a promo code, then a
shop's referral code. A promo code wins a clash; staff can't make one that is already a shop's code
or a demo code ("That code is taken. Choose another."), and a shop made later with a promo code's
name gets a number.

**One code per shop, before it subscribes.** A shop uses one promo or referral code; they don't
stack. Entering the same code again changes nothing. A demo code still works after one (it makes the
shop free anyway). Codes are refused once Stripe bills the shop, and for demo, canceled or past-due
shops.

Refusals (shown under the field):

- "That code isn’t valid." (unknown, turned off, past its last day, used up)
- "Your shop already used code MEET26. It’s one code per shop."
- "Codes are for shops that haven’t subscribed yet."
- "Your shop doesn’t pay for Sundeck Pro, so it doesn’t need a code."
- "That’s your own shop’s code. Share it with other pool companies."
- "That code is from a shop you belong to. Share it with other pool companies."

## Promo codes

`app.promo_code`: code (3 to 24 letters and numbers), free months (0 to 12), percent off (1 to 100)
for 1 to 36 paid months or forever, on/off, optional last day, optional most uses, note, who made
it. At least one of free months or percent off. The offer can't be edited once made (what a shop was
promised stays true); staff turn a code off instead, and shops that used it keep their offer. The
offer is copied onto the shop's `subscription` row when applied (`promo_code`, `promo_kind`,
`promo_applied_at`, `promo_free_months`, `promo_percent_off`, `promo_percent_months`).

- **Free months set the trial's length from sign-up**, like the mailer's 3 months: a code with 3
  free months is "3 months free" (the trial ends 3 months after sign-up, never earlier than it
  already did). This is the meetup's "3 free months". Checkout already takes the trial end from
  `subscription.trial_ends_at`.
- **Percent off is a Stripe coupon** on the Checkout session (`discounts`). One coupon per offer,
  made the first time and reused, under a fixed id (`sundeckpro_20off_13mo`,
  `sundeckpro_10off_forever`) named "Sundeck Pro 20% off for 12 months". A repeating coupon counts
  its months from when it's applied (Checkout, the start of the trial), so it lasts the trial's
  whole calendar months plus the paid months promised (core `couponMonths`): "20% off for 12 months"
  is 12 paid bills at 20% off whatever the trial. Price changes (team size) keep the coupon.

Wording: "3 months free", "20% off for 12 months", "15% off forever", "3 months free, then 20% off
for 12 months" (`offerText`). The trial page's heading and button follow ("3 months free",
"Start 3-Month Free Trial"; `trialTerms`), the price shows the discounted amount with "20% off your
first 12 paid months, then $79 a month.", the card side says "Then $63.20 a month for 12 months, then
$79. Add a card to start.", and a check line confirms "Code MEET26: 3 months free." The embedded
Checkout starts again for the new trial and coupon.

## Referral codes: Give a Month, Get a Month

- **Every shop's code is its name**: capitals, letters and numbers only, without a company-type
  ending (LLC, Inc, Co, Corp, Ltd, …), at most 20 characters ("Blue Wave Pools, LLC" is
  BLUEWAVEPOOLS). A number is added only when another shop, a demo code or a promo code has it
  (BLUEWAVEPOOLS2). Made by a trigger when the shop's subscription row is made; existing shops were
  given theirs in the migration. Typing the name with its LLC still finds it.
- **The new shop** gets 1 extra month on its trial at once ("2 months free", or 4 for a mailer shop),
  and the line "Code BLUEWAVEPOOLS: 1 extra month free, thanks to Blue Wave Pools."
- **The referring shop** gets a free month when the new shop's first real payment succeeds (Stripe
  `invoice.paid` on the platform account with `amount_paid > 0`), once per referred shop. Waiting
  for a payment stops fake sign-ups farming free months.
  - Subscribed: a **Stripe customer balance credit** equal to its current monthly price (package
    and team size), description "A free month for referring Blue Wave Pools". Chosen over a 100%
    one-month coupon because it needs no change to the subscription, can't replace or collide with
    a promo coupon already on it, stacks for several referrals, and shows on the next invoice as
    applied balance. Sent with the idempotency key `referral_reward_<referred shop>`, so a retried
    event can't credit twice.
  - Still on its trial with no Stripe subscription: a month added to its trial.
  - A demo or canceled shop: nothing, recorded as "none".
  - Recorded on the referred shop's row (`referred_by`, `referral_rewarded_at`, `referral_reward`,
    `referral_reward_cents`) by `public.referral_reward`, which gives it only once.
- **Can't refer yourself**: not your own shop's code, nor a shop you belong to.

Settings › Sundeck Pro Billing (owners; not demo shops) has the card **Give a Month, Get a Month**:
"Share your code with another pool company. They get an extra month free, and you get a free month
once they start paying." The code large, **Copy Code** and **Share** (the share sheet where there is
one; elsewhere **Copy Message**), and "No shops have used your code yet." / "1 shop has used your
code. Your free month comes when it starts paying." / "3 shops have used your code. 2 free months
earned." The message: "Try Sundeck Pro for your pool business. Enter code BLUEWAVEPOOLS when you
start your free trial and get an extra month free: https://sundeckpro.com/sign-up".

Before subscribing, the same page has **Have a Code?** under Subscribe, which opens the field; once
a code is used, its check line shows instead (also after subscribing).

### On More and in the account menu (owner, same day: "Referral links should be more visible")

Owners (demo shops too) also see it at the top of **More**, above the first list, in the brand's
orange accent, which More uses nowhere else (`components/referral-offer.tsx`):

- A card on a soft orange wash (`color.brand.safety` at 10% over `role.surface`, 14% in dark mode),
  no outline, with a 44 pt round Safety-orange badge holding a navy gift symbol.
- **Give a Month, Get a Month** (Barlow, bold) and "Share your code. They get an extra month free,
  and so do you." (secondary text).
- "Your code" and the code large in Barlow ExtraBold on a white (dark: card-colored) ticket with a
  dashed orange edge; codes over 12 letters get smaller type so a 20-letter code stays on one line.
- **Share**: a pill in Safety orange with navy text (4.9:1), full width on phones, beside the code
  on computers. It opens the share sheet where there is one, otherwise the sheet below.
- The rest of the card opens a sheet titled Give a Month, Get a Month (Done) holding the full card
  above. It isn't a link to the billing page, which doesn't show the card to demo shops.

On a computer, the account menu (the avatar at the end of the header, with Contact Us) has the same
thing as a tinted item under the name: the gift badge, **Give a Month, Get a Month**, and the code;
it opens the same sheet. Admins, techs, shops without a code, and any error show nothing. More
reads `referral_summary` with its other data; the header passes it to the menu unawaited.

## Admin portal

- **Codes** (Growth › Codes): Promo Codes (code, note, who made it, offer, used by with the shops
  and dates, last day, On/Off, **Turn Off** / **Turn On**), **New Code** (a sheet with a preview,
  "Shops will see: 3 months free"), Referrals (new shop, referred by, when, the referring shop's
  month: "$79.00 credit in Stripe", "A month added to its trial", "Waiting for the first payment"),
  and Demo Codes (read-only, with uses). Making and turning codes on or off is in the Activity Log.
- **Shops** has a Code column (the code and "Promo code", "Referred by …" or "Demo code").
- **A shop's page** › Subscription: Code used (with its offer and date), Referred by (and their
  month), Referral code, Shops referred.

## Stripe setup (owner)

The live **Sundeck Pro** webhook (events from Your account) must also send `invoice.paid`;
without it referrers get their month only from a later fix. Coupons and balance credits need no
dashboard setup. Checkout allows `discounts` with subscriptions; promotion codes typed on Stripe's
form stay off (`allow_promotion_codes` isn't set), so every code goes through our field.
