# Owner's list, 2026-10-19: website changes and app handover

The owner asked for these changes on the website first, with notes so the iPhone (Swift) and
Expo apps can get the same. Each section says what changed on the website, the data behind it,
and what the apps need to do. Database changes are shared: the apps read and write the same
tables and columns through sync.

Status key: **Website done** means built, checked, and committed on `claude/cool-keller-efjc00`.

## 1. Free trial is 30 days

- **Website done.** New shops get `trial_ends_at = now() + 30 days`
  (`20261012005300_trial_30_days.sql`). Landing page, pricing, sign-up, onboarding ("Start 30-Day
  Free Trial"), and the billing message say 30 days; the FAQ says the first charge is on day 31.
- **Apps:** change any "14 days" / "14-day" wording to 30. The trial date itself comes from the
  server.

## 2. Contact us: office@sundeckpro.com

- **Website done.** Landing page: under the FAQ ("Still have a question? Contact us at ...") and
  in the footer of every public page. Portal: More › Help › Contact Us (phones) and the account
  menu (wider screens). Constant `CONTACT_EMAIL` in `apps/web/src/lib/site.ts`.
- **Apps:** add a Contact Us row (Settings / More, Help group) that opens
  `mailto:office@sundeckpro.com`, showing the address under the label.

## 3. Onboarding: no chlorine question, no Share This Sample

- **Website done.** The pool shop's setup step no longer asks "Chlorine your techs carry". The
  sample visit / sample report no longer has a Share This Sample button.
- **Apps:** if the apps show onboarding, remove the same two things.
