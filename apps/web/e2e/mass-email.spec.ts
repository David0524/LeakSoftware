import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedInClient } from "./backend";
import { OWNER, RUN, TECH, signIn } from "./helpers";
import { findEmails } from "./outbox";

// Email Customers (owner, 2026-10-22: "send mass email (with some filtering)"): an owner picks
// customers with the filters and sees the count, sends a test to themselves, then sends after an
// alert; each customer gets their own email with the shop's address and an unsubscribe link,
// and unsubscribing leaves them out of the next one. Needs 20261022001500_mass_email.sql.

const SCREENS = process.env.E2E_SCREENSHOTS;

async function companyOf(db: SupabaseClient) {
  const { data: who } = await db.auth.getUser();
  const { data } = await db
    .from("membership")
    .select("company_id")
    .eq("user_id", who.user!.id)
    .limit(1)
    .single();
  return data!.company_id as string;
}

test.describe("email customers", () => {
  test.describe.configure({ mode: "serial" });
  // One city only these customers have, so the count is exact on a shared database.
  const city = `Mailton ${RUN}`;
  const rosa = `rosa-${RUN}@example.com`;
  const uma = `uma-${RUN}@example.com`;
  let owner: SupabaseClient;
  let company: string;
  const made: string[] = [];
  let address: Record<string, string | null> | null = null;

  test.beforeAll(async () => {
    owner = await signedInClient(OWNER.email, OWNER.password);
    company = await companyOf(owner);
    for (const [name, email, optOut] of [
      [`Rosa ${RUN} Diaz`, rosa, false],
      [`Uma ${RUN} Unsub`, uma, true],
    ] as const) {
      const { data: id, error } = await owner.rpc("create_job", {
        target_company: company,
        new_customer: { name, email },
        existing_customer: null,
        new_property: { address_line1: "200 W Washington St", city, state: "AZ" },
        existing_property: null,
        job: { status: "unscheduled", type: "detection" },
        components: [],
      });
      if (error) throw error;
      const { data: job } = await owner
        .from("job")
        .select("bill_to_customer_id")
        .eq("id", id as string)
        .single();
      made.push(job!.bill_to_customer_id as string);
      if (optOut)
        await owner
          .from("customer")
          .update({ marketing_opt_out: true })
          .eq("id", job!.bill_to_customer_id);
      await owner
        .from("job")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id as string);
    }
    // The law asks for the shop's mailing address in every mass email: give the demo shop one
    // when it has none, and put it back after.
    const { data: shop } = await owner
      .from("company")
      .select("address_line1, city, state, postal_code")
      .eq("id", company)
      .single();
    if (!shop?.address_line1 || !shop.city || !shop.state || !shop.postal_code) {
      address = shop;
      await owner
        .from("company")
        .update({
          address_line1: "200 W Washington St",
          city: "Phoenix",
          state: "AZ",
          postal_code: "85003",
        })
        .eq("id", company);
    }
  });

  test.afterAll(async () => {
    const at = new Date().toISOString();
    for (const id of made) {
      await owner.from("property").update({ deleted_at: at }).eq("customer_id", id);
      await owner.from("customer").update({ deleted_at: at }).eq("id", id);
    }
    if (address) await owner.from("company").update(address).eq("id", company);
  });

  test("compose with a filter, send a test, send, and unsubscribe", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await signIn(page, OWNER, "/customers");
    await page.getByRole("link", { name: "Email Customers" }).click();
    await expect(page.getByRole("heading", { name: "Email Customers", level: 1 })).toBeVisible();

    const count = page.getByTestId("mass-email-count");
    await page.getByRole("combobox", { name: "City" }).selectOption(city);
    await expect(count).toHaveText("1 customer with an email. 1 left out: 1 unsubscribed.");
    // Filters combine: nobody here had a job in the last 30 days (their jobs are deleted).
    await page.getByRole("combobox", { name: "Last Job" }).selectOption("30");
    await expect(count).toContainText("0 customers with an email.");
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await page.getByRole("combobox", { name: "Last Job" }).selectOption("");
    await expect(count).toContainText("1 customer with an email.");

    // Empty fields say so, under each.
    await page.getByRole("button", { name: "Send Test to Me" }).click();
    await expect(page.getByText("Add a subject.")).toBeVisible();
    await expect(page.getByText("Write a message.")).toBeVisible();

    const subject = `Fall opening ${RUN}`;
    await page.getByRole("textbox", { name: "Subject" }).fill(subject);
    await page
      .getByRole("textbox", { name: "Message" })
      .fill("Hi {first name},\n\nPool openings start next week. Reply to book yours.");
    if (SCREENS)
      await page.screenshot({ path: `${SCREENS}/mass-email-desktop.png`, fullPage: true });

    // Send Test to Me: to the owner's own address, marked as a test.
    await page.getByRole("button", { name: "Send Test to Me" }).click();
    await expect(page.getByText(`Test sent to ${OWNER.email}.`)).toBeVisible();
    const tests = await findEmails((e) => e.to === OWNER.email && e.subject === `Test: ${subject}`);
    expect(tests).toHaveLength(1);
    expect(tests[0]!.text).toContain("/unsubscribe/test");

    // Send, after the alert that names the count.
    await page.getByRole("button", { name: "Send to 1 Customer" }).click();
    const alert = page.getByRole("alertdialog");
    await expect(alert.getByText("Send to 1 customer?")).toBeVisible();
    await expect(alert).toContainText(`“${subject}” goes out now from`);
    await alert.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("Sent to 1 customer.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Subject" })).toHaveValue("");
    await expect(page.getByRole("listitem").filter({ hasText: subject })).toContainText(
      "Sent to 1",
    );

    // One email, to Rosa only (Uma unsubscribed), with her first name, the shop's address,
    // and her own unsubscribe link; replies go to the shop.
    expect(await findEmails((e) => e.to === uma)).toHaveLength(0);
    const sent = await findEmails((e) => e.to === rosa);
    expect(sent).toHaveLength(1);
    const email = sent[0]! as (typeof sent)[0] & {
      replyTo?: string | null;
      from: string;
      headers?: Record<string, string>;
    };
    expect(email.subject).toBe(subject);
    expect(email.text).toContain(`Hi Rosa,`);
    expect(email.text).toMatch(/· .+, [A-Z]{2} \d{5}/);
    expect(email.from).toMatch(/via Sundeck Pro" <news@/);
    expect(email.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const link = /Unsubscribe: (\S+)/.exec(email.text)![1]!;
    expect(email.headers?.["List-Unsubscribe"]).toBe(
      `<${link.replace("/unsubscribe/", "/api/unsubscribe/")}>`,
    );

    // The customer unsubscribes from the link (no sign-in) ...
    const customer = await page.context().browser()!.newPage();
    await customer.goto(link);
    await expect(customer.getByRole("heading", { name: /^Stop emails from / })).toBeVisible();
    await customer.getByRole("button", { name: "Unsubscribe" }).click();
    await expect(customer.getByText(/^You’re unsubscribed\./)).toBeVisible();
    await customer.close();

    // ... and is left out of the next one.
    await page.reload();
    await page.getByRole("combobox", { name: "City" }).selectOption(city);
    await expect(count).toHaveText("0 customers with an email. 2 left out: 2 unsubscribed.");
  });

  test("on a phone, and not for techs", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, OWNER, "/customers");
    await page.getByRole("link", { name: "Email Customers" }).click();
    await expect(page.getByTestId("mass-email-count")).toContainText("with an email.");
    if (SCREENS) await page.screenshot({ path: `${SCREENS}/mass-email-phone.png`, fullPage: true });
    if (SCREENS) {
      await page.goto("/customers");
      await page.screenshot({ path: `${SCREENS}/mass-email-customers-phone.png` });
    }

    await page.context().clearCookies();
    await signIn(page, TECH, "/customers");
    await expect(page.getByRole("link", { name: "Email Customers" })).toHaveCount(0);
    await page.goto("/customers/email");
    await expect(page.getByText("Only owners and admins can email customers.")).toBeVisible();
  });
});
