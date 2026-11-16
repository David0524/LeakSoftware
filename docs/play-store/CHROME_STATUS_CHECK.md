# Status check: where Sundeck Pro stands on Google Play (Claude in Chrome)

Paste everything below the line into Claude in Chrome, signed in to Chrome with the Google
account that owns the Play developer account. It only looks: it changes nothing. When it
finishes, paste its report back to Claude Code.

Why (2026-11-16): the owner wants to know where the Google Play review stands. The repository's
records say: 1.0.0 (version code 4) was sent for production review (United States) and is also
on internal testing, checked 2026-11-13; review emails were off. Version 1.0.1 (code 6, monthly
billing) is built but deliberately **not** uploaded: the owner uploads it after 1.0.0 is
approved. The Play service account for automatic uploads isn't set up yet. This check finds out
what Play shows now.

---

You're checking the status of my company's Android app, **Sundeck Pro** (package
`com.sundeckpro.app`), in the Google Play Console (https://play.google.com/console). Version
1.0.0 was sent to Google for production review around 2026-11-13. I want to know whether it's
approved, still in review, or rejected, and anything Google is asking for.

## Rules

1. **Look only. Change nothing.** Don't fill in, save, submit, upload, promote, or roll out
   anything, and don't press **Send for review**, **Start rollout**, or **Publish**, even if the
   page invites you to.
2. Never type, read out, or store a password or key. If a page asks for one, stop and tell me.
3. Copy Play's wording **word for word** (statuses, warnings, error messages, dates). Don't
   summarize them away.
4. If something isn't where these steps say, look around nearby, then say where you found it
   (or that you couldn't).

## What to check

**1. Developer account**
- Home (the list of apps): is Sundeck Pro listed? What status does it show under its name?
- Any banner at the top of any page (verification, policy, payments): copy it.
- Settings (gear) › **Developer account › Account details**: account type (organization or
  personal), and whether identity, the organization, and the contact email and phone show as
  verified. Note the contact email (that's where Google sends review emails).
- Settings › **Notifications** (or email preferences): is email turned on for app review and
  publishing updates? Note which addresses get them.

**2. Publishing overview** (in Sundeck Pro, left menu)
- Copy everything: "Changes in review", "Changes not yet sent for review", "Changes ready to
  publish", and whether Managed publishing is on or off.
- If there's a **Send for review** button or "x changes ready to send", say so (but don't press
  it).
- If the review is finished: the date and the outcome, word for word. If it was rejected, copy
  the whole reason and the policy it names.

**3. Dashboard** (in Sundeck Pro)
- List every task under "Set up your app", "Release your app" (or "Test and release"), and any
  other section, each with its status (done, not started, action needed).
- If it shows **"Run a closed test"** or a 12-testers / 14-days requirement, copy it exactly.

**4. Test and release**
- **Production**: does a release exist? Its name, version code, and status (draft, in review,
  rejected, available). Copy any error or warning.
- **Testing › Internal testing**: releases, version codes, status, and the tester list name.
- **Testing › Closed testing** and **Open testing**: any tracks or releases?
- **App bundle explorer** (or Latest releases and bundles): list every uploaded version code
  with its upload date. I expect codes up to 4, the newest from about 2026-11-13. Code 6
  (1.0.1) should **not** be there yet; tell me if it is, or if there's anything else newer.

**5. Policy and programs › App content**
For each item, give its status (completed, action needed, not started) and copy any warning:
Privacy policy, App access, Ads, Content rating (and the rating it got), Target audience and
content, Data safety, Government apps, Financial features, Health, News apps, and any
**permissions declaration** (for example foreground service, or "Sensitive app permissions").
- In **Data safety**, say whether **App activity › App interactions** and **App info and
  performance › Diagnostics** are listed as collected.

**6. Grow users › Store presence**
- **Main store listing**: is it saved? How many phone screenshots, and do the icon and feature
  graphic show? Any warnings?
- **Store settings**: category and contact email.

**7. API access** (Settings › **API access**, or Users and permissions)
- Is any Google Cloud project linked? Is any service account listed (an email ending in
  `iam.gserviceaccount.com`), and what permissions does it have? I expect none yet.

**8. Inbox and policy status**
- The Play Console **Inbox** (bell or envelope icon): copy any message from the last 30 days.
- **Policy and programs › Policy status**: any issues, rejections, or "app not compliant"
  notices? Copy them.
- **Android vitals** or **Pre-launch report** for code 4: any crashes, ANRs, or warnings
  (for example the code obfuscation warning, which should clear with the next upload).

## Report back in this form

```text
ACCOUNT: type / verified? / contact email / review emails on?
APP STATUS (Home): ...
PUBLISHING OVERVIEW: in review: ... / not sent: ... / managed publishing: on|off
PRODUCTION: none | release <name>, code <n>, status <in review | approved | rejected | available>, date
REVIEW OUTCOME: (if finished) exact wording, and any rejection reason and policy
INTERNAL TESTING: code <n>, status <...>, testers <list>
CLOSED/OPEN TESTING: ...
BUNDLES UPLOADED: code <n> (<date>), ...
DASHBOARD TASKS NOT DONE: ...
CLOSED TEST REQUIRED: yes/no (exact wording)
APP CONTENT: <item>: <status> (warning text) ...
DATA SAFETY has App interactions / Diagnostics: yes/no, yes/no
STORE LISTING: ...
SERVICE ACCOUNTS / API ACCESS: none | <email>: <permissions>
PRE-LAUNCH / VITALS WARNINGS: ...
INBOX / POLICY MESSAGES: ...
ANYTHING ELSE THAT LOOKS WRONG: ...
```
