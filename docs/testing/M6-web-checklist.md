# M6 checklist: the office website

The website isn't deployed yet (that comes with M7). To try it on your computer:

```sh
git pull
corepack pnpm install
cd apps/web
corepack pnpm dev
```

Open http://localhost:3000. It uses the hosted dev project, so you'll see the same jobs as the
phone. Sign in as `owner@demo.leakbook.test` / `leakbook-demo`.

1. **Home page.** Signed out, `/` explains Sundeck Pro with Start Free Trial and Sign In.
2. **Jobs.** The list shows open jobs. Try the filters (Scheduled, In Progress, All).
3. **Sample job.** Choose **All**, open the job for **Sam Sample**. Check the checklist (Main
   drain excluded: No diver on site), the tests (Return 3 dropped 8 PSI; bucket test fails), the
   two findings on the pool diagram, and the timeline at the bottom.
4. **A phone job.** Open a job you created on the iPhone; its photos and markup appear under
   Photos and Recordings.
5. **Customers.** Search for "Maria"; open her and see the visit history.
6. **Schedule.** Week view by tech; switch to Day; Previous / Next / Today.
7. **Price book.** Settings → Price Book. Add an item, open it, change the price, save, remove it.
8. **Branding.** Settings → Company and Branding. Upload a logo, pick a main color, and watch the
   contrast check. Save.
9. **Invite a tech.** Settings → Team → invite an email you can use. Copy the link, open it in a
   private window, create the account. That person sees Jobs, Schedule, Customers, but Settings
   says it's for owners. Back as the owner, turn their access off.
10. **Dark mode.** Switch your computer to dark mode and look around.

Tell me what reads wrong for an office manager, or anything the shop would want to see on these
pages that isn't there.
