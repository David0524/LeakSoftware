# Things only the owner can do

Owner, 2026-10-22: "a list of things you need from me. I'll knock them out later." Newest
first. Tick an item off by deleting it (and tell Claude, so it can check the result).

## From 2026-10-22: Admin portal, password reset, usage

1. **Put your email on the staff list** (needed for the Admin portal). Vercel › the web
   project › Settings › Environment Variables › `SUNDECK_STAFF_EMAILS` = your email (more than
   one: comma-separated), for Production. Redeploy. Then turn on two-step sign-in in the office
   (More › Two-Step Sign-In) and use **Admin Sign In** at the bottom of the home page.

2. **Send Supabase's own emails through Resend** (sign-in links and sign-up confirmations).
   Today they go out through Supabase's built-in mailer, limited to a couple an hour. Password
   reset emails don't need this: our server already sends those through Resend.
   Supabase dashboard › the project › Authentication › Emails › SMTP Settings › Enable custom
   SMTP:
   - Host `smtp.resend.com`, port `465`, username `resend`
   - Password: a Resend API key (Resend › API Keys › Create, "Sending access" for
     `send.sundeckpro.com`)
   - Sender email `account@send.sundeckpro.com`, sender name `Sundeck Pro`
   Or create the Resend key and give it to Claude, and Claude sets it through Supabase's API.

3. **Check two keys are set on Vercel (Production)**: `RESEND_API_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY`. Password reset emails, Send Password Reset, the Admin portal and
   usage tracking all need them. (Report emails already work, so the first is almost certainly
   there.)

4. **Update the app privacy answers for usage tracking** before the next App Store or Play
   review.
   - App Store Connect › the app › App Privacy: add **Product Interaction** and **Other
     Diagnostic Data**, both *linked to the user*, used for *Analytics* and *App
     Functionality*, *not* used for tracking.
   - Google Play Console › App content › Data safety: add **App activity › App interactions**
     and **App info and performance › Diagnostics**, collected, not shared, for *Analytics*.

5. **Read the privacy policy's two new lines** (sundeckpro.com/privacy, "What we keep" and "Who
   owns it"): that each person's use of the app is kept for 180 days, and that staff look at a
   shop's records to help the shop and its people, logged. The policy is still marked as a
   draft for your final legal text.

6. **Decide on the Next.js security upgrade.** The website's build warns that this Next.js
   version has a known security vulnerability and recommends upgrading. Say the word and Claude
   runs the upgrade on its own branch, checks everything, and ships it.
