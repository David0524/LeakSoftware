# Vercel bill: three settings to change (Claude in Chrome)

Paste everything below the line into Claude in Chrome while you're signed in to Vercel
(https://vercel.com) as the account that pays the bill. When it finishes, paste its report back
to Claude Code.

Why (2026-11-13): the bill was $25.75, almost all of it from two lines. Build CPU Minutes
($13.50, 66 hours) and Function Storage ($11.43, 114 GB-months). Running the site cost about
$0.45. The code side is already done (`docs/DECISIONS.md`, 2026-11-13): Vercel installs only the
website's packages, skips the type check CI already ran, and each deployment's functions are
about 20% smaller. What's left lives in Vercel's settings, which no code can change.

---

You're changing three settings for my company's website, **Sundeck Pro** (sundeckpro.com), on
Vercel (https://vercel.com). The goal is to cut what Vercel charges for builds and for storing
old deployments. The site itself must keep working exactly as it does now.

## Rules

1. Change only the settings listed below. Don't delete, pause, or transfer a project, don't
   remove a domain or environment variable, don't change the plan or payment details, and
   don't redeploy or roll back anything.
2. Never type, read out, or store a password, token, or key. If a page asks for one, stop and
   tell me.
3. Before each change, copy the current value **word for word**. After it, copy the new value.
4. If a setting isn't where these steps say (Vercel moves things), look nearby, then tell me
   where you found it, or that you couldn't.
5. If a change asks you to confirm a cost, or warns that something will be deleted *right now*
   (not later on a schedule), stop and ask me.

## Step 1: Find the project or projects

1. Open the team **drudd524-4205's projects** (the team picker is top left).
2. List every project on the team. For each one, give its name, the GitHub repository it's
   connected to, and its production domain.
3. Note whether **more than one** project is connected to the `LeakSoftware` repository. If
   there are two, each push builds twice. Don't change anything yet; tell me in the report.

The website's project is the one that serves `sundeckpro.com`. Steps 2 to 4 are all on that
project, under **Settings**.

## Step 2: Build machine (cuts Build CPU Minutes)

Settings › **Build and Deployment** (it may be called "General" or "Builds"):

1. **Build Machine**: copy the current choice, then choose **Standard** (the smallest one). If
   Standard is already selected, leave it.
2. **On-Demand Concurrent Builds** (or "Concurrent builds"), if it's there: copy its value and
   turn it **off**.
3. Copy, without changing, the **Root Directory**, **Install Command**, and **Build Command**
   values, and whether each shows "Override" turned on. If Install Command is overridden in
   the dashboard, turn the override **off** so the repository's `vercel.json` decides it.
4. Save.

## Step 3: Deployment retention (cuts Function Storage)

Settings › **Security** › **Deployment Retention Policy** (it may be under "Advanced" or
"Deployment Protection"):

1. Copy the current value of each row.
2. Set them to:
   - Canceled deployments: **1 week**
   - Errored deployments: **1 week**
   - Pre-production / preview deployments: **1 week**
   - Production deployments: **30 days** (Vercel always keeps the one that's live)
3. Save. Vercel deletes the older ones on its own schedule, which is expected.

## Step 4: Check it worked

1. Team **Settings › Billing** (or **Usage**): copy the lines for **Build CPU Minutes** and
   **Function Storage** (amount and dollars), and the billing period's dates.
2. The project's **Deployments** page: roughly how many deployments are listed? Is the newest
   production one marked **Ready** and **Current**?
3. Open https://sundeckpro.com and say whether the home page loads.

## Report

Send back:
- The projects from Step 1 (name, repository, domain), and whether two share the repository.
- Each setting from Steps 2 and 3: the old value, then the new value, word for word.
- Anything you couldn't find or didn't change, and why.
- The Step 4 numbers and whether the site loads.
