import { expect, test } from "@playwright/test";
import { adminClient } from "./backend";
import { OWNER, RUN, signIn } from "./helpers";

// Import Customers (owner, 2026-10-16): an owner imports a CSV export; columns are matched,
// the preview shows what will be made, and importing the same file again adds nothing.

test("an owner imports customers, pools, and visit plans from a CSV", async ({ page }) => {
  const admin = adminClient();
  test.skip(!admin, "Needs SUPABASE_SERVICE_ROLE_KEY (CI runs it against Supabase in Docker).");
  const csv = [
    "Customer,E-mail,Cell,Address,Pool Size,Route Day,Service Frequency,Monthly Rate,Technician",
    `Imported Ana ${RUN},ana-${RUN}@import.test,(480) 555-0181,"11 Palm Ln, Mesa, AZ 85201","18,000",Tuesday,Weekly,$173.33,Nobody Here`,
    `Imported Bo ${RUN},,(480) 555-0182,"12 Oak St, Tempe, AZ 85281",15k,Mon/Thu,Bi-Weekly,,`,
    `,,,,,,,,`,
  ].join("\n");
  const file = { name: "customers.csv", mimeType: "text/csv", buffer: Buffer.from(csv) };

  await signIn(page, OWNER, "/settings/import");
  await page.getByLabel("Choose CSV File").setInputFiles(file);
  // The columns are matched from their names; the shop can change any of them.
  await expect(page.getByLabel("Column: Customer")).toHaveValue("name");
  await expect(page.getByLabel("Column: Monthly Rate")).toHaveValue("monthly_price");
  await expect(page.getByLabel("Column: Route Day")).toHaveValue("visit_day");
  await page.getByRole("button", { name: "Check File" }).click();

  const summary = page.getByTestId("import-summary");
  await expect(summary).toContainText("Customers2");
  await expect(summary).toContainText("Visit plans2");
  await expect(page.getByText("More than one service day", { exact: false })).toBeVisible();
  await expect(page.getByText("isn’t on the team yet", { exact: false })).toBeVisible();
  await expect(page.getByText(`Imported Ana ${RUN}`)).toBeVisible();
  await page.getByRole("button", { name: "Import 2 Customers" }).click();
  await expect(
    page.getByText(/Imported 2 customers and 2 pools, with 2 visit plans/),
  ).toBeVisible();

  const { data: plans } = await admin!
    .from("service_plan")
    .select("id, interval_weeks, price_cents, customer:customer_id(name)")
    .in(
      "customer_id",
      (await admin!.from("customer").select("id").like("name", `Imported % ${RUN}`)).data!.map(
        (c) => c.id,
      ),
    );
  expect(plans).toHaveLength(2);
  // $173.33 a month, weekly: $40 a visit.
  expect(plans!.map((p) => p.price_cents).sort()).toEqual([4000, null].sort());

  // The same file again: both are already in Tidemark, so nothing is added.
  await page.getByRole("button", { name: "Import Another File" }).click();
  await page.getByLabel("Choose CSV File").setInputFiles(file);
  await page.getByRole("button", { name: "Check File" }).click();
  await expect(page.getByText("2 already in Tidemark", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import 0 Customers" })).toBeDisabled();

  // Clean up: the plans end, so their visits leave the demo schedule.
  await admin!
    .from("service_plan")
    .update({ deleted_at: new Date().toISOString() })
    .in(
      "id",
      plans!.map((p) => p.id),
    );
});
