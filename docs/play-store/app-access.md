# Google Play app access (reviewer sign-in, draft, 2026-10-22)

Play Console › Sundeck Pro › Monitor and improve › Policy and programs › App content › App
access › **All or some functionality in my app is restricted** › Add instructions. Google's
reviewers need a working account, because every screen is behind sign-in.

**The owner types the password into Play Console; it is never written in this repository**
(the repository is public).

| Field | Value |
|---|---|
| Instruction name | Demo shop (owner) |
| Username / email | `owner@demo.leakbook.test` (the demo shop's owner, made by `scripts/demo-reset.mjs`) |
| Password | The owner provides it in Play Console |
| Any other information | See below |

Use the demo shop on the Supabase project the build signs in to (today `leakbook-dev`,
`config/supabase-dev.json`, the one sundeckpro.com uses, unless `EXPO_PUBLIC_SUPABASE_URL` is
set in the EAS production environment), and keep two-step sign-in **off** for this account, or
Play's reviewers can't get in. Run
`pnpm demo:reset` (dry run first, then `-- --apply`) before submitting so the demo data is
fresh and dated around the review.

Other information (paste into the field):

```text
Sundeck Pro is for pool service and leak detection shops; accounts are made by a shop on sundeckpro.com. This is a demo shop with made-up customers, set to both packages. Texts and calls run in demo mode: nothing is sent to real people.

1. Sign in with the email and password above. The app opens on Today, the day's route.
2. Tap a stop's customer name to open the job. Checklist: mark items Not Leaking, Leaking, or Needs Attention. Photos: take a photo (allow the camera).
3. Wrap-Up: open Report to see the report the customer gets, then Review with Customer for the signature.
4. Jobs, Schedule, and Messages are in the tab bar; More has settings, invoices, and Delete My Account.

Location is asked for only when a photo is taken, to show the photo was taken on site; declining it is fine. No purchases are made in the app.
```

**Owner to confirm:** the password you enter here is the demo owner's current one (`pnpm
demo:reset` keeps existing accounts' passwords and uses the demo password only for accounts it
has to make), and the demo shop's texts and calls are still in demo mode; the reviewer could instead use the demo tech,
`tech@demo.leakbook.test`, which has fewer screens.
