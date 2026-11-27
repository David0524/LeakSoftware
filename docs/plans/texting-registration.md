# Texting registration (plan, 2026-11-27; waiting on the owner's go)

Owner, 2026-11-27: "Let's do A and C. Some shops will want their own number." Sundeck Pro pays
for both; registrations go to Twilio automatically; local numbers stay on offer too.

## Why

Sundeck Pro's Twilio account was empty until now: no numbers, no Messaging Service, no compliance
profile. Every text so far was demo mode. US carriers block business texts from numbers that
aren't registered, so every way a shop gets a number needs a registration of its own:

| Choice in Settings › Phone and Texting | Twilio steps | Cost to Sundeck Pro (approx.) | Usual wait |
|---|---|---|---|
| **Get a Toll-Free Number** (recommended in the app) | Buy toll-free → toll-free verification | about $2/mo, verification free | a few days to 2 weeks |
| **Get a Local Number** | Shop's A2P brand (Low-Volume) + campaign → buy local number → add to campaign | about $20 once + about $3/mo | 1 to 3 weeks |
| **Use My Own Number** | Shop's A2P brand + campaign → hosted SMS order (owner confirms by code) → add to campaign | about $20 once + about $3/mo | 1 to 3 weeks |

Calls work on a new number right away; texts wait for approval. A hosted number keeps its calls
with the shop's carrier.

## Before any of this works (owner)

1. Twilio Business Profile (ISV) for Sundeck Pro, LLC: EIN, address, representative, social URL
   (Claude in Chrome fills it in; Twilio approves in a few days).
2. The three `TWILIO_*` variables on Vercel, from that account, plus a geo permission of US and
   Canada only (`docs/release/security-review-2026-10-16.md`).

## What the shop sees (all four platforms, same wording)

Settings › Phone and Texting, iOS style (inset grouped list, sheets):

1. **Choose:** Get a Toll-Free Number · Get a Local Number · Use My Own Number (a `Choice` list,
   each with one line of cost-free explanation and the usual wait).
2. **Business Details** sheet (once per shop, owners only): legal business name, EIN, business
   address, website (optional for toll-free), contact name, email, mobile. Footer: "Phone
   companies require this before your shop can text customers. We submit it for you."
3. **Status** row on the page, replacing "It usually takes a few days":
   - Registering… "Phone companies are reviewing your business. This usually takes about two
     weeks. Calls already work." (new numbers)
   - Check Your Texts: "We sent a code to (702) 381-1966. Enter it to confirm the number is
     yours." (own number; field + Confirm)
   - Ready: "Your customers can text (702) 381-1966."
   - Needs Changes: Twilio's reason in plain words, with Edit Business Details.
4. Until Ready, On My Way and report links keep opening the tech's Messages app, as today.

## How it works

- **Data:** `texting_registration` (server only, no sync, no client grants): company, path
  (toll_free, local, own), the business details, each Twilio id (secondary customer profile,
  brand, campaign, Messaging Service, toll-free verification, hosted number order), state, and
  Twilio's last message. EIN readable by the shop's owners and staff only. `phone_line.status`
  stays `pending` until the state machine reaches Ready.
- **Twilio (REST, as `twilio.ts` does today):** Trust Hub secondary customer profile per shop →
  `a2p/BrandRegistrations` (Low-Volume Standard) → per-shop Messaging Service + `UsAppToPerson`
  campaign (Customer Care / Mixed, our sample texts, opt-in = the shop's customers give their
  number when booking) → number. Toll-free: `Tollfree/Verifications`. Own number:
  `HostedNumber/Orders`.
- **Progress:** Twilio's status callbacks where offered, plus a cron route every 30 min that
  advances each registration one step; each step is idempotent, so a retry never pays twice.
- **Sending:** each text uses the shop's own Messaging Service (not the one global
  `TWILIO_MESSAGING_SERVICE_SID`).
- **Admin portal › Texting:** every registration with its state and Twilio's message, and Retry.
- **Existing pending line:** Southern Nevada Leak Detection's (702) 381-1966 becomes a Use My Own
  Number registration; they fill in Business Details on their next visit.

## Testing

Twilio's API is mocked in unit tests (each state and failure); pgTAP for the table's access
(owners and staff only, techs nothing); Playwright for the form and each status on phone size;
iPhone screenshots for each status. One real run end to end with the demo shop's own details
before it's offered to shops.

## Open questions

- Twilio's campaign and toll-free reviewers may reject a sample message; the first real
  submission tells us, and the wording is config (seed rows), not code.
- Monthly campaign fees vary by campaign type; confirm on Twilio's pricing page once the account
  is open.
