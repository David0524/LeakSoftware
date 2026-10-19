# New-shop onboarding (2026-10-16)

Built with the app-onboarding-questionnaire skill. This file is that skill's saved state (it
normally keeps it in memory): read it before changing the flow. Code:
`apps/web/src/components/onboarding.tsx`, copy and answer checks in
`packages/core/src/onboarding.ts`, pages in `apps/web/src/app/(onboarding)/welcome/`.

## App profile
- **What:** an offline-first field app and office website for pool service and leak detection
  shops. One app, two packages (Pool Maintenance, Leak Detection) and Both.
- **Who:** owners of small shops (1 to 12 people), signing up on the website, often after a
  sales call.
- **Where onboarding runs:** the website, between sign-up and the office. The phone app only
  signs in, and selling in an iOS app would need in-app purchase.
- **Permissions:** camera, microphone, location are phone-only and already asked in context,
  so there is no permission priming.
- **Paywall:** Stripe Checkout for a card-first 30-day trial, priced by package and people.

## Transformation
- **Pool Maintenance.** Before: the route lives in group texts, customers say a pool was
  skipped, month-end billing is chased by hand, new techs guess at chemicals. After: every
  stop on the tech's phone with a checklist and photos, a summary to the homeowner, invoices
  drafted monthly, amounts worked out from the readings.
- **Leak Detection.** Before: reports written at night, homeowners who don't follow the
  findings, quotes that go cold, deposits chased. After: the report finished on site in plain
  words with a diagram, a quote accepted online with the deposit paid.

## Blueprint (as built)
| # | Screen | Pool Maintenance | Leak Detection |
|---|---|---|---|
| 1 | Welcome | "Every pool on your route, handled." + a Today's route preview | "Reports that sell the repair." + an inspection preview |
| 2 | Goal (single) | 6 goals, e.g. Getting paid every month | 6 goals, e.g. Win more repair jobs |
| 3 | Pains (multi) | 6, e.g. Customers say we skipped their pool | 6, e.g. Reports take my evenings |
| 4 | How Sundeck Pro helps | each picked pain with its answer (the usual three if none) | same |
| 5 | Setup | people (price shown), report color, chlorine carried | people, report color, deposit 25/50/none |
| 6 | Setting up | saves the answers; only as long as the save takes (min 0.9 s) | same |
| 7 | Demo | sample visit: change 3 readings, What to Add updates | sample inspection: mark 4 spots |
| 8 | Result + Share | the visit summary in their color | the homeowner report in their color |
| 9 | Trial | price for their team, what's included, Start 30-Day Free Trial (Stripe) | same |
| — | Done | next steps: invite techs, add customers, customer payments | invite techs, customer payments, first job |

Skipped from the skill on purpose: social proof (no real testimonials yet; never invent them),
swipe cards (too playful for business owners), comparison table (the home page has the
competitor comparison), account creation (sign-up comes first), permission priming (phone
only).

## Rules
- Skip (goal, pains, how) jumps to Setup; Back works on every screen but Setting up.
- The shop is read-only until the card is in, so the server keeps the answers on
  `subscription.onboarding` and applies them (`finishOnboarding`) after Checkout: on the
  return page and in the webhook, whichever is first.
- Coming back from Checkout without finishing lands on the Trial screen with the answers kept.
- Owners of a shop with onboarding left are sent to `/welcome` from the office.
