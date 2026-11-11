# Things only the owner can do

Owner, 2026-10-22: "a list of things you need from me. I'll knock them out later." Newest
first. Tick an item off by deleting it (and tell Claude, so it can check the result).

## From 2026-11-06: Google Search Console

1. **Done before 2026-11-06** (the owner set up Search Console on their own). The sitemap only
   exists since 2026-11-06 (`https://sundeckpro.com/sitemap.xml`; it was a 404 before): Search
   Console › Sitemaps › enter `sitemap.xml` › Submit, if it isn't listed there yet.
2. **Bing Webmaster Tools** (optional, also covers DuckDuckGo):
   https://www.bing.com/webmasters › Import from Google Search Console.
3. **Google Business Profile** (optional, if you want Sundeck Pro on Google Maps and in local
   results): https://business.google.com with the phone (702) 785-1548, as a service-area
   business so no street address is shown.

## From 2026-11-05: after Apple approved 1.0.0

1. **Done (2026-11-05):** 1.0.0 released and 1.0.1 (build 1076) submitted for App Review, set
   to release automatically once Apple approves it.

2. **Move the Apple developer account to Sundeck Pro, LLC.** Until then the App Store shows your
   own name as the seller. Apps, ratings and testers carry over. **Requested from Apple
   (2026-11-05; D-U-N-S number in hand).** Waiting on Apple: answer their email or call and
   form (step 3), then tell Claude "Apple account is on the LLC".
   1. The LLC's D-U-N-S number (the same one Google Play needs below). Apple's free lookup finds
      it or requests one: https://developer.apple.com/enroll/duns-lookup/. The legal name and
      address must match the LLC's Nevada registration exactly. A new number takes up to about
      a week through Apple's tool.
   2. Apple needs: the D-U-N-S number, a public website on the company's domain
      (`sundeckpro.com`), a work email on that domain, and you as someone who can sign for the
      LLC.
   3. https://developer.apple.com/contact/topic/select › **Membership and Account** › ask to
      convert the individual membership to an organization. Apple replies with a form and may
      call to confirm you can sign for the LLC.
   4. When Apple confirms, check App Store Connect › Business: the LLC's bank and tax details
      (the app is free, so nothing is paid, but Apple may ask). Tell Claude "Apple account is
      on the LLC"; Claude updates the App Store copyright and docs if anything changed.

3. **Android:** live on Play's internal testing (1.0.0, version code 2, 2026-11-10; the
   "Sundeck team" tester list). Left: add Firebase's FCM V1 key in Expo
   (`docs/play-store/README.md` step 4.4 to 4.5), the Play service account (step 8), real
   Android store screenshots, then production (step 9).

## From 2026-10-22: Android on Google Play

1. **Set up Google Play, Expo and Firebase for the Android app**, in the order in
   `docs/play-store/README.md`: D-U-N-S number (the one Apple needs too), the Play developer
   account (organization), an Expo token, a Firebase project, the GitHub secrets, the first
   build uploaded by hand, then a Play service account so later builds upload by themselves.
   Each step says what to send back to Claude.

## From 2026-10-22: Admin portal, password reset, usage

1. **Put David's and Cole's emails on the staff list** (needed for the Admin portal). Vercel ›
   the web project › Settings › Environment Variables › `SUNDECK_STAFF_EMAILS` =
   `david@sundeckpro.com,cole@sundeckpro.com`, for Production. Redeploy. Their accounts exist
   (made 2026-10-22 with the password the owner chose; change it after the first sign-in with
   Forgot Password?). Then each one: **Admin Sign In** at the bottom of the home page, the
   portal says to set up two-step sign-in, scan the code with an authenticator app, done.

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
