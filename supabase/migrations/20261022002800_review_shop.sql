-- The App Review shop (owner, 2026-10-24; docs/release/PRODUCTION.md, section 9). Apple's and
-- Google's reviewers sign in to a shop of their own (scripts/review-account.mjs) as its owner,
-- so on a server with Twilio and Resend keys they could otherwise buy a real texting number,
-- text or call any US number, and email reports, quotes and invoices to any address.
--
--   company.review_shop   true for that shop. The website's server then:
--                           - refuses phone number purchases ("Phone numbers can't be added to
--                             the App Review shop."), and calls;
--                           - records texts as sent without handing them to Twilio, as a server
--                             without Twilio keys does (demo mode, apps/web/src/server/twilio.ts);
--                           - records emails as sent without handing them to Resend, except to
--                             addresses at sundeckpro.com, so Sundeck Pro can test
--                             (apps/web/src/server/review-shop.ts).
--
-- Set only by the service role (the review-account script). Members can't write it: company's
-- client-writable columns are a fixed list (app.sync_table, 20261012000600_access.sql), and this
-- one isn't on it, so no grant is made, and sync_push (security invoker) is refused too. It
-- reads with the rest of the company row, which is harmless.

alter table public.company add column review_shop boolean not null default false;

comment on column public.company.review_shop is
  'The App Review shop: nothing it sends reaches a real person (server-enforced; set by the service role only).';
