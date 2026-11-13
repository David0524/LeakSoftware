# Status check: where Sundeck Pro stands on Google Play (Claude in Chrome)

Paste everything below the line into Claude in Chrome, signed in to Chrome with the Google
account that owns the Play developer account. It only looks: it changes nothing. When it
finishes, paste its report back to Claude Code.

Why (2026-11-13): the owner expected a Google review email and hasn't had one. The repository's
records say: 1.0.0 (version code 2) has been on internal testing since 2026-11-10; a newer build
(made 2026-11-12, without the background-audio permissions) wasn't uploaded to Play; and there's
no record of a production release being sent for review. This check finds out what Play
actually shows.

---

You're checking the status of my company's Android app, **Sundeck Pro** (package
`com.sundeckpro.app`), in the Google Play Console (https://play.google.com/console). I want to
know whether it has been sent to Google for review, and if not, what is still missing.

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
  with its upload date. I expect version code 2 from 2026-11-10; tell me if there's anything
  newer.

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

**7. Inbox and policy status**
- The Play Console **Inbox** (bell or envelope icon): copy any message from the last 30 days.
- **Policy and programs › Policy status**: any issues, rejections, or "app not compliant"
  notices? Copy them.

## Report back in this form

```text
ACCOUNT: type / verified? / contact email / review emails on?
APP STATUS (Home): ...
PUBLISHING OVERVIEW: in review: ... / not sent: ... / managed publishing: on|off
PRODUCTION: none | release <name>, code <n>, status <...>
INTERNAL TESTING: code <n>, status <...>, testers <list>
CLOSED/OPEN TESTING: ...
BUNDLES UPLOADED: code <n> (<date>), ...
DASHBOARD TASKS NOT DONE: ...
CLOSED TEST REQUIRED: yes/no (exact wording)
APP CONTENT: <item>: <status> (warning text) ...
DATA SAFETY has App interactions / Diagnostics: yes/no, yes/no
STORE LISTING: ...
INBOX / POLICY MESSAGES: ...
ANYTHING ELSE THAT LOOKS WRONG: ...
```
