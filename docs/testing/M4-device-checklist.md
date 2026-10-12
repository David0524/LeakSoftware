# M4 device checklist: the inspection

Setup is the same as `M3-device-checklist.md`. Pull the latest code first:

```sh
git pull
corepack pnpm install
cd apps/mobile
npx expo start --lan
```

Sign in as `tech@demo.leakbook.test` / `leakbook-demo`.

1. **New job gets a checklist.** Create a job with **Has a spa** on, choose **Start now**. On the job, the **Checklist** tab already lists Skimmer 1, Return 1, Return 2, Main drain 1, Light 1, Shell, Steps and benches, Spa, Equipment pad, all marked TO DO.
2. **Older jobs.** Open job #1001. Its Checklist tab shows **Set up checklist**. Tap it and the list appears.
3. **Add instances.** Tap **+ Add skimmer** once and **+ Add return** twice. You now have Skimmer 1-2 and Return 1-4.
4. **Inspected.** Tap Return 1 → **Inspected** → How: **Pressure test** → Save. The row shows INSPECTED and "Pressure test".
5. **Excluded needs a reason.** Tap Main drain 1 → **Not inspected** → Save without a reason: it asks for one. Pick **No diver on site** → Save. The row shows EXCLUDED with the reason.
6. **Pressure test math.** On Return 3, tap **+ Pressure test**. The line is already "Return 3". Enter start 20, end 12, duration 15. The result reads "Dropped 8 PSI in 15 min" with **Fail** selected. Save. Then add one on Return 1 with 20 / 20 / 15: "Held at 20 PSI in 15 min", **Pass**.
7. **Bucket test.** Tests tab → **+ Bucket / evaporation test**: pool 10 → 9.25, bucket 10 → 9.94, 24 hours. It shows 0.69 in lost beyond evaporation and **Fail**.
8. **Override.** Change an outcome from the suggestion. A note asks you to say why.
9. **Dye test.** Add one with location "Return 3 fitting", result "Dye drawn in (leak)", outcome **Fail**.
10. **Finding with a pin.** Findings tab → pick the pool shape that fits (try Kidney) → **Add finding**: "Return 3 line break", severity **Major**, component Return 3, tap the diagram near where Return 3 would be → Save. The pin shows numbered and red on the Findings tab.
11. **Offline.** Turn on airplane mode (keep the app open). Mark a few more items, add a test and a second finding. Turn airplane mode off. The sync bar returns to "All changes saved to the office".
12. **Second account.** Sign out, sign in as `owner@demo.leakbook.test`. The same checklist, tests, outcomes, and pins are there.

Report anything confusing to use with one hand at the pool, hard to tap, or worded oddly.
