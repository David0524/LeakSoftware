# Company texting (built 2026-10-16; see docs/DECISIONS.md)

Owner request, 2026-10-16, from the pool company: texts should come from the company's number,
not each tech's phone, and the whole team should see the same conversation with each customer,
as in Housecall Pro.

## Today

On My Way and "text the report link" open the tech's own Messages app (`sms:` links). The
customer sees the tech's personal number, replies go to that tech only, and Tidemark only logs
that a link was texted (`message.channel = 'sms_device'`).

## What it would be

- **One company number per shop.** A new local number, or the shop's existing business number
  made textable (hosted SMS, which keeps calls where they are today).
- **A shared inbox.** One thread per customer, the same for everyone on the team, on the website
  (Messages, with unread counts) and on the phones. New texts notify the team.
- **Everything goes out from the company number and lands in the thread:** On My Way, report,
  quote, and invoice links, reminders, and anything typed by hand. Customer replies come back
  into the same thread.
- **Who sees threads** follows Settings › Team › Techs see (every job, or only their own
  customers' threads).

## What it needs

- **A texting provider.** Recommended: Twilio, with one subaccount per shop that Tidemark
  manages. It has the best documentation and handles US registration. Telnyx and Bandwidth
  cost less per text, but have smaller ecosystems.
- **US carrier registration (A2P 10DLC).** Required for business texting from local numbers.
  Each shop registers a brand (legal name and EIN) and one campaign ("customer care and
  appointment notifications"). Approval takes days to a few weeks, and texts can't go out
  until then.
- **Consent and opt-out.** Customers agree to texts when booking (a checkbox on New Job and in
  the customer's details). STOP and HELP replies are handled automatically, and an opted-out
  customer can't be texted.
- **Costs (Twilio's published rates, approximate; check before deciding):**

  | Item | Cost |
  |---|---|
  | Number | about $1 to $2 a month |
  | Each text, out or in | about a cent, plus carrier fees of a fraction of a cent |
  | Registration | a one-time brand fee, a campaign vetting fee, and a small monthly campaign fee per shop |

- **Database and code:**
  - New tables, each with `company_id`, RLS, and phone sync: `phone_number`, `conversation`,
    `text_message`.
  - Server routes to send and to receive (provider webhooks with signature checks).
  - Push notifications to phones.
  - A Messages screen on the website and the phone.

## Decisions for the owner

Answered 2026-10-16: Twilio; the number is still open (new or existing both work, existing
numbers are finished by Tidemark); Tidemark pays; calls as Housecall Pro does them; pictures
on, with a switch to turn them off.

1. **Provider:** Twilio (recommended) or another?
2. **Number:** a new number per shop, or text-enable each shop's existing number?
3. **Who pays for texting:** included in the subscription up to a monthly amount, or passed
   through at cost?
4. **Calls:** texting only, or also forward calls to the company number to the office?
5. **Pictures:** customers and techs can send photos in texts (MMS, which costs a little more)?

## Suggested order, once decided

1. **Company number and outbound texts:** On My Way and link texts from the company number,
   logged in a thread.
2. **Replies and the shared inbox on the website.**
3. **The inbox on the phones**, with notifications.
4. **Automatic texts:** reminders by text, with consent.
