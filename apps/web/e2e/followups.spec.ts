import { expect, test } from "@playwright/test";
import { E2E_CRON_SECRET, adminClient } from "./backend";
import { findEmails } from "./outbox";
import { draftQuote, sendFromOffice } from "./money";

// M10: the daily job sends a reminder for a quote not yet accepted, with the customer's link
// and a way to stop these emails; after stopping, nothing more is sent to them.

test.describe.configure({ mode: "serial" });

const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

test("a quote reminder goes out once, and the customer can stop them", async ({
  page,
  request,
}) => {
  test.skip(
    !adminClient(),
    "Needs SUPABASE_SERVICE_ROLE_KEY (CI runs it against Supabase in Docker).",
  );
  const cron = (at: string) =>
    request.get(`/api/cron/daily?at=${encodeURIComponent(at)}`, {
      headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
    });
  expect((await request.get("/api/cron/daily")).status()).toBe(401);

  const quote = await draftQuote([["Replace skimmer throat", 22_500]]);
  const link = await sendFromOffice(page, quote.number);
  const token = link.split("/").pop()!;
  const forThisQuote = () =>
    findEmails((e) => e.to === "sam@example.com" && e.text.includes(`/q/${token}`));

  // Four days later: the 3-day reminder, once.
  const first = await cron(daysFromNow(4));
  expect(first.status()).toBe(200);
  let emails = await forThisQuote();
  expect(emails).toHaveLength(1);
  expect(emails[0]!.subject).toBe("Your repair quote from Demo Leak Co.");
  expect(emails[0]!.text).toContain(`A reminder about your quote #${quote.number}`);
  await cron(daysFromNow(4));
  expect(await forThisQuote()).toHaveLength(1);

  // The customer stops these emails from the link at the bottom.
  const stop = /Stop reminder and review emails from Demo Leak Co\.: (\S+)/.exec(
    emails[0]!.text,
  )![1]!;
  await page.context().clearCookies();
  await page.goto(stop);
  await expect(
    page.getByRole("heading", { name: "Stop reminder and review emails?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop These Emails" }).click();
  await expect(page.getByText(/won’t send you reminder or review emails/)).toBeVisible();

  // Eight days later the 7-day reminder would be due, but they opted out.
  await cron(daysFromNow(8));
  emails = await forThisQuote();
  expect(emails).toHaveLength(1);

  // Turn it back on for the other tests (the office can, on the customer's page).
  const admin = adminClient()!;
  const { data: job } = await admin
    .from("job")
    .select("bill_to_customer_id")
    .eq("id", "00000000-0000-4000-8000-00000000e001")
    .single();
  await admin
    .from("customer")
    .update({ marketing_opt_out: false })
    .eq("id", job!.bill_to_customer_id);
});
