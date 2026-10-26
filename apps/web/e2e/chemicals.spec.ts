import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedInClient } from "./backend";
import { OWNER, RUN, jobSection, signIn } from "./helpers";

// Added chemicals (owner, 2026-10-24; docs/design/2026-10-24-chemicals-added.md): on a visit,
// each reading with its Aim For, what to add and what was added, saved as the tech goes; a
// shop that charges sees prices, and the month's chemicals go on the monthly invoice; the
// visit report shows what was added; Monthly shops send one report a month with the invoice.

interface Shop {
  owner: SupabaseClient;
  company: string;
  settings: Record<string, unknown>;
}

async function shop(): Promise<Shop> {
  const owner = await signedInClient(OWNER.email, OWNER.password);
  const { data: who } = await owner.auth.getUser();
  const { data: m } = await owner
    .from("membership")
    .select("company_id")
    .eq("user_id", who.user!.id)
    .limit(1)
    .single();
  const { data: c } = await owner
    .from("company")
    .select("settings")
    .eq("id", m!.company_id)
    .single();
  return { owner, company: m!.company_id, settings: c!.settings as Record<string, unknown> };
}

/** The shop's settings with `patch`, put back by the returned function. */
async function withSettings(s: Shop, patch: Record<string, unknown>) {
  const { error } = await s.owner
    .from("company")
    .update({ settings: { ...s.settings, ...patch } })
    .eq("id", s.company);
  if (error) throw error;
  return async () => {
    await s.owner.from("company").update({ settings: s.settings }).eq("id", s.company);
  };
}

/** A new customer and pool, and a maintenance visit on `day`. */
async function visit(s: Shop, name: string, day: string) {
  const { data: first, error } = await s.owner.rpc("create_job", {
    target_company: s.company,
    new_customer: { name, email: `chem-${RUN}@example.com` },
    existing_customer: null,
    new_property: { address_line1: "455 N Galvin Pkwy", city: "Phoenix", state: "AZ" },
    existing_property: null,
    job: { status: "unscheduled" },
    components: [],
  });
  if (error) throw error;
  const { data: job } = await s.owner
    .from("job")
    .select("bill_to_customer_id, property_id")
    .eq("id", first)
    .single();
  await s.owner.from("property").update({ approx_gallons: 20000 }).eq("id", job!.property_id);
  const { data: v, error: e2 } = await s.owner
    .from("job")
    .insert({
      company_id: s.company,
      type: "maintenance",
      property_id: job!.property_id,
      bill_to_customer_id: job!.bill_to_customer_id,
      status: "in_progress",
      // The visit's day (its plan_date is the server's): its month is the billing month.
      scheduled_start: `${day}T17:00:00Z`,
    })
    .select("id")
    .single();
  if (e2) throw e2;
  return {
    id: v!.id as string,
    customer: job!.bill_to_customer_id as string,
    property: job!.property_id as string,
  };
}

async function openChemicals(page: Page, jobId: string) {
  await page.goto(`/jobs/${jobId}`);
  await jobSection(page, "Checklist");
  const card = page.getByTestId("visit-chemicals");
  const toggle = card.getByRole("button", { name: /^Chemicals/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  return card;
}

test("a tech records what was added, priced when the shop charges, and the report shows it", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const s = await shop();
  const restore = await withSettings(s, { charge_chemicals: true, visit_reports: "manual" });
  try {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(
      new Date(),
    );
    const v = await visit(s, `Chemicals ${RUN}`, today);
    await signIn(page, OWNER, "/jobs");
    const card = await openChemicals(page, v.id);

    // Readings and the levels to aim for: the suggestions follow, numbered in the order to add.
    await card.getByLabel("Free chlorine reading").fill("1");
    await card.getByLabel(/^Free chlorine: aim for/).fill("4");
    await card.getByLabel("pH reading").fill("7.8");
    await card.getByLabel("Alkalinity reading").fill("90");
    await card.getByLabel("Calcium reading").fill("260");
    await card.getByLabel("Stabilizer reading").fill("30");
    await card.getByLabel(/^Stabilizer: aim for/).fill("40");
    await expect(card.getByTestId("reading-fc")).toContainText("½ gal liquid chlorine");
    await expect(card.getByTestId("reading-ph")).toContainText("¼ gal muriatic acid");
    await expect(card.getByTestId("reading-cya")).toContainText("1½ lb stabilizer");
    await expect(card.getByTestId("reading-ta")).toContainText("In range");
    await expect(card).toContainText("Water balance");

    // One tap adds a suggestion as it is; Mark All Added adds the rest.
    await card.getByRole("button", { name: "Mark added: ½ gal Liquid chlorine" }).click();
    await expect(card.getByTestId("reading-fc")).toContainText("Added");
    await card.getByRole("button", { name: "Mark All Added" }).click();
    await expect(card.getByRole("button", { name: "Mark All Added" })).toHaveCount(0);
    // ½ gal × $8 + ¼ gal × $15 + 1½ lb × $9
    await expect(card.getByTestId("chemicals-today")).toHaveText("$21.25");

    // Added on its own: three tabs.
    await card.getByRole("button", { name: "Add Chemical" }).click();
    const sheet = page.getByRole("dialog", { name: "Add Chemical" });
    await sheet.getByRole("button", { name: /^Chlorine tabs/ }).click();
    await sheet.getByRole("button", { name: "More" }).click();
    await sheet.getByRole("button", { name: "More" }).click();
    await expect(sheet.getByTestId("amount")).toHaveValue("3");
    await sheet.getByRole("button", { name: "Add", exact: true }).click();
    await expect(card.getByTestId("also-added")).toContainText("3 tabs Chlorine tabs");
    await expect(card.getByTestId("chemicals-today")).toHaveText("$28.75");

    // Saved: after a reload it's all still there.
    await page.reload();
    const again = await openChemicals(page, v.id);
    await expect(again.getByLabel("Free chlorine reading")).toHaveValue("1");
    await expect(again.getByTestId("also-added")).toContainText("3 tabs Chlorine tabs");
    const { data: rows } = await s.owner
      .from("chemical_addition")
      .select("name, quantity, unit_price_cents")
      .eq("job_id", v.id)
      .is("deleted_at", null);
    expect(rows).toHaveLength(4);

    // The report: Added Chemicals with prices, and the water balance.
    await s.owner
      .from("job")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", v.id);
    const { data: sent, error } = await s.owner.rpc("send_visit_report", { target_job: v.id });
    if (error) throw error;
    await page.goto(`/r/${(sent as { token: string }).token}`);
    const added = page.getByTestId("added-chemicals");
    await expect(added).toContainText("½ gal Liquid chlorine");
    await expect(added).toContainText("$4.00");
    await expect(added).toContainText("3 tabs Chlorine tabs");
    await expect(page.getByText("Billed on your", { exact: false })).toBeVisible();
    await expect(page.getByTestId("water-balance")).toBeVisible();
  } finally {
    await restore();
  }
});

test("Monthly shops send the month's report with the monthly invoice", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const s = await shop();
  // A month long past, so this run's visit is the only one billed in it.
  const month = "2025-01-01";
  const restore = await withSettings(s, { charge_chemicals: true, visit_reports: "monthly" });
  try {
    const v = await visit(s, `Monthly Chemicals ${RUN}`, "2025-01-15");
    const { data: item } = await s.owner
      .from("price_book_item")
      .select("id")
      .eq("company_id", s.company)
      .eq("chemical", "liquid_chlorine")
      .is("deleted_at", null)
      .order("sort_order")
      .limit(1)
      .single();
    // As a phone writes it: the server sets the price ($8.00 a gallon in the demo shop).
    const { error } = await s.owner.from("chemical_addition").insert([
      {
        company_id: s.company,
        job_id: v.id,
        property_id: v.property,
        price_book_item_id: item!.id,
        name: "Liquid chlorine",
        unit: "gal",
        quantity: 1.5,
      },
    ]);
    if (error) throw error;
    await s.owner.from("job").update({ status: "done" }).eq("id", v.id);
    const { error: billError } = await s.owner.rpc("create_monthly_invoices", {
      target_company: s.company,
      month,
    });
    if (billError) throw billError;
    const { data: inv } = await s.owner
      .from("invoice")
      .select("id")
      .eq("customer_id", v.customer)
      .eq("period_month", month)
      .neq("status", "void")
      .single();
    const { data: lines } = await s.owner
      .from("invoice_line_item")
      .select("description, quantity, unit")
      .eq("invoice_id", inv!.id)
      .is("deleted_at", null);
    expect(lines).toEqual([
      { description: "Liquid chlorine, January", quantity: 1.5, unit: "gal" },
    ]);

    // Sent as the phone sends it: the message carries both links.
    const { data: session } = await s.owner.auth.getSession();
    const res = await request.post(`/api/invoices/${inv!.id}/send`, {
      headers: { authorization: `Bearer ${session.session!.access_token}` },
      data: { channel: "sms_device" },
    });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { link: string; message: string; reportLink: string | null };
    expect(body.reportLink).toMatch(/\/r\//);
    expect(body.message).toContain(body.reportLink!);

    // The invoice page links the report, and the report the invoice.
    await page.goto(new URL(body.link).pathname);
    await expect(page.getByText("1½ gal × $8.00")).toBeVisible();
    await page.getByTestId("month-report-link").click();
    await expect(page.getByTestId("month-report")).toContainText("January Service Report");
    await expect(page.getByTestId("month-chemicals")).toContainText("1½ gal Liquid chlorine");
    await expect(page.getByRole("link", { name: "View January Invoice" })).toBeVisible();
  } finally {
    await restore();
  }
});
