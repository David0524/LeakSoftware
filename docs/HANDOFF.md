# Handoff: Pool Leak Detection Software MVP

## Context

I'm building niche software for pool leak detection companies. These are mostly small shops (one to five trucks) whose techs inspect pools, run pressure and dye tests, find leaks, and then sell the repair. Today they document jobs on paper, in generic form apps, or in weak bundled tools from equipment makers.

The goal is a profitable niche business, not a venture-scale platform. Keep the architecture simple, cheap to run, and easy for one person to maintain.

My cousin works at a leak detection company and will be the design partner. Several details below (checklist items, test types, price book, report layout) are first drafts. I'll confirm them with him, so build them as editable configuration, not hardcoded logic.

## What the MVP must do

The MVP covers one complete job loop: a tech inspects a pool, produces a professional report, turns the findings into a repair quote, the customer accepts and pays a deposit, and the shop invoices the job.

### 1. Field inspection (mobile app, used by techs on site)

- Create a job tied to a customer and a property (address, pool type: gunite/plaster, vinyl, fiberglass; pool and spa yes/no).
- Guided checklist by pool component: skimmers, returns, main drains, lights, shell, steps and benches, spa (if present), equipment pad. Components with multiple instances (e.g., 2 skimmers, 4 returns) can be added and numbered.
- Each checklist item is marked **inspected** (with the method used) or **excluded** (with a required reason). This matters legally: it shows what was and wasn't checked if a leak turns up later.
- Structured test entry:
  - Pressure test per line: line name, start PSI, end PSI, duration, pass/fail.
  - Dye test: location, result.
  - Bucket / evaporation test: start and end readings, duration, calculated loss.
  - Listening / electronic detection: location, result, notes.
- Photos and short videos attached to a specific component or finding, with simple markup (arrow, circle, text).
- Findings: each leak found has a location, component, severity, and a pin on a simple top-down pool diagram.
- Voice notes with transcription.
- **Full offline support.** Backyards often have poor signal. Everything in this section must work with no connection and sync when back online, including photos.

### 2. Report output

- AI-generated narrative summary built from the structured job data. The tech reviews and edits before sending. The AI must not invent findings; it only summarizes what was recorded.
- Two report templates for MVP:
  - **Homeowner:** plain language, what was found, what it means, recommended next step.
  - **Partner** (pool service company or builder): technical detail, test results, component by component.
  - Leave a clean slot for a third **insurance adjuster** template. Do not build it yet; I need input from my cousin first.
- Output as a branded PDF (company logo, colors, contact info) and as a shareable web link.
- Send by email and text.
- Customer signature captured on site, on the tech's device.

### 3. Findings to repair quote

- From the findings, the tech builds a repair quote in a few taps using the company's **price book** (editable list of repair items with default prices, e.g., "replace return fitting," "repair pressure line," "light niche reseal").
- Line items are editable on the spot.
- The quote is delivered with the report (same link).
- Customer accepts the quote and pays a deposit from that link.
- Accepted quote creates a repair job that can be scheduled.

### 4. Basic invoicing

- Generate an invoice from a completed job (detection fee and/or repair).
- Card and ACH payment via a hosted payment link.
- Job and invoice status: draft, sent, paid.

### 5. Minimal office view (web)

Not a full dispatch system. Just enough to run the loop:
- List of jobs with status (scheduled, in progress, report sent, quote accepted, invoiced, paid).
- Customer and property records with visit history.
- Company settings: logo, colors, price book, checklist configuration, team members.

## Suggested stack

Open to pushback if you see a better fit, but default to:

- **Mobile app:** Expo (React Native, TypeScript). Local SQLite for offline storage with a sync queue. Native camera access. iOS first, Android should work without much extra effort.
- **Backend:** Supabase (Postgres, auth, file storage, row level security).
- **Web:** Next.js for the office view and the customer-facing report / quote / payment page.
- **Payments:** Stripe (Payment Links or Checkout for deposits and invoices; Stripe Connect so each shop gets paid directly).
- **AI narrative:** Claude API, called server side.
- **Transcription:** a hosted speech-to-text API, server side.
- **PDF:** server-side generation from an HTML template.
- **Email/SMS:** Resend (or similar) for email, Twilio for SMS.

## Architecture requirements

- **Multi-tenant from day one.** Every record belongs to a company. Enforce isolation with row level security. A shop must never see another shop's data.
- **Roles:** owner/admin, tech. Keep it at two for now.
- **Config driven:** checklist components, test types, report templates, and price book are data, not code. Seed with sensible defaults.
- **Offline first on mobile:** design the sync model before building screens. Conflict handling can be simple (last write wins per field, with an audit log) since one tech usually owns a job.
- **Photos:** compress on device, upload in background, retry on failure.
- Keep running costs low. Avoid services with high fixed monthly fees.

## Rough data model

company, user, customer, property, job (type: detection | repair), checklist_item_result, test_result, finding, media, report, quote, quote_line_item, price_book_item, invoice, payment, signature, audit_log.

Adjust as needed. Explain any major changes.

## Build order

1. Project setup, auth, multi-tenant schema with RLS, seed data.
2. Mobile: job creation and the inspection checklist, offline from the start.
3. Mobile: tests, findings, photos with markup, pool diagram pins, voice notes.
4. Sync engine and background media upload.
5. AI narrative, report templates, PDF and shareable link, signature, send by email/SMS.
6. Price book, quote builder, customer acceptance, Stripe deposit.
7. Invoicing and payment.
8. Office web view and company settings.

Stop after each milestone, summarize what was built, and flag decisions I should weigh in on.

## Out of scope for MVP

Dispatch and routing, partner portal, insurance template, QuickBooks sync, owner dashboard and analytics, warranty tracking, follow-up reminders, review requests, payroll, inventory, accounting. These come later. Don't build ahead.

## Definition of done

A tech can, with no signal at the pool:
1. Run a full inspection with tests, photos, and findings.
2. Get a customer signature.

Then, once back online:
3. Send a branded report with an AI summary they reviewed.
4. Send a repair quote the customer accepts and pays a deposit on from their phone.
5. Invoice the job and get paid.

And the owner can see every job's status from the web.

## Open questions (I'll get answers from my cousin)

- Exact checklist items and test procedures they follow.
- What their current reports look like and who reads them.
- Typical repair line items and prices for the price book.
- How often insurance is involved and what adjusters ask for.
- Where jobs come from (homeowners, pool companies, insurers) and who pays.

Build so these answers drop in as configuration changes, not rewrites.
