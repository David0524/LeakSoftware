import { expect, test, type Page } from "@playwright/test";
import { OWNER, closeWrapUpStep, jobSection, signIn, wrapUpStep } from "./helpers";
import { PHONE, SAMPLE_JOB } from "./money";

// Wrap-Up as a finish list (owner, 2026-10-22, option A; docs/design/2026-10-22-wrap-up.md): a
// row per step with its state, each opening that step in a sheet, and one button naming the
// next step. Nothing here saves, so the sample job's state can be anything: the checks hold for
// every state.

// The seeded sample job; against another database, E2E_WRAP_UP_JOB names a job with a Wrap-Up.
const JOB = process.env.E2E_WRAP_UP_JOB ?? SAMPLE_JOB;
const ACTIONS = ["Write the Draft", "Send Quote", "Review with Customer", "Send Invoice"];

async function checkList(page: Page) {
  const list = page.getByTestId("wrap-up");
  // "Sam Sample · 2 of 4 done", or "All done".
  await expect(list.getByTestId("wrap-up-count")).toHaveText(/^.+ · (\d+ of \d+ done|All done)$/);
  const rows = list.getByRole("list", { name: "Wrap-Up steps" }).getByRole("button");
  expect(await rows.count()).toBeGreaterThanOrEqual(3);
  // Each row reads as one target: its step, title, state, and whether it's done or next.
  for (const name of await rows.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label"))))
    expect(name).toMatch(/^Step \d of \d, /);
  await expect(list.getByTestId("wrap-up-report")).toContainText(
    /Not written yet|Draft ready|Sent · version \d+/,
  );
  await expect(list.getByTestId("wrap-up-sign")).toContainText(
    /Not yet|Signed by|Not signed|Write the report first|Sent without a signature/,
  );
  // Every row is a 44 pt+ target.
  for (const box of await rows.evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().height),
  ))
    expect(box).toBeGreaterThanOrEqual(44);
  const next = list.getByRole("button", { name: /, next$/ });
  return (await next.count()) ? ((await next.getAttribute("aria-label")) ?? "") : null;
}

test("on a computer, the finish list sits beside the open step", async ({ page }) => {
  await signIn(page, OWNER, `/jobs/${JOB}`);
  // The job page has tabs on every screen (owner, 2026-10-22); Wrap-Up is kept in the URL.
  await jobSection(page, "Wrap-Up");
  await expect(page).toHaveURL(/\?tab=wrap-up$/);
  const next = await checkList(page);
  const panel = page.getByTestId("wrap-up-panel");

  // The bottom button names the next step's action (hidden when all is done), and the panel
  // starts on that step.
  const button = page.getByTestId("wrap-up-next");
  if (next) {
    await expect(button).toBeVisible();
    expect(ACTIONS).toContain(await button.innerText());
    const title = next.split(", ")[1]!;
    await expect(panel.getByRole("heading").first()).toHaveText(
      title === "Customer signs" ? "Customer Signs" : title,
    );
  } else {
    await expect(button).toHaveCount(0);
  }

  // A row opens its step in the panel beside the list, never a dialog; Done puts it away.
  const step = await wrapUpStep(page, "Report");
  await expect(panel.getByRole("heading", { name: "Report", exact: true })).toBeVisible();
  await expect(step.getByTestId("report-homeowner")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByTestId("wrap-up").getByRole("button", { name: /, Report,/ }),
  ).toHaveAttribute("aria-current", "true");
  await closeWrapUpStep(page);
  await expect(page.getByText("Choose a step to open it here.")).toBeVisible();

  const invoice = await wrapUpStep(page, "Invoice");
  await expect(
    invoice
      .getByTestId("invoice")
      .or(invoice.getByText(/Create Invoice|Start the job/))
      .first(),
  ).toBeVisible();

  // A reload keeps the tab.
  await page.reload();
  await expect(page.getByTestId("wrap-up")).toBeVisible();
});

test.describe("on a phone", () => {
  test.use(PHONE);

  test("the Next Step bar names the next step and opens it", async ({ page }) => {
    await signIn(page, OWNER, `/jobs/${JOB}`);
    await page.getByRole("tab", { name: /^Wrap-Up/ }).click();
    const next = await checkList(page);
    // On phones the button is on the Next Step bar above the tab bar, not under the list.
    await expect(page.getByTestId("wrap-up-next")).toBeHidden();
    const bar = page.getByRole("toolbar", { name: "Next step" });
    if (!next) {
      await expect(bar).toHaveCount(0);
      return;
    }
    const action = (await bar.getByRole("button").first().innerText()).trim();
    expect(ACTIONS).toContain(action);
    if (action === "Review with Customer") return; // starts the review: nothing to open here.
    await bar.getByRole("button", { name: action }).click();
    // The sheet for the next row's step.
    const sheet = page.getByRole("dialog").last();
    await expect(sheet).toBeVisible();
    const title = next.split(", ")[1]!;
    await expect(sheet.getByRole("heading").first()).toHaveText(
      title === "Customer signs" ? "Customer Signs" : title,
    );
    await closeWrapUpStep(page);
  });

  test("a row opens its step in a sheet", async ({ page }) => {
    await signIn(page, OWNER, `/jobs/${JOB}`);
    await page.getByRole("tab", { name: /^Wrap-Up/ }).click();
    await wrapUpStep(page, "Customer signs");
    // Its sheet, or Report's while there's no report to sign yet.
    await expect(page.getByRole("dialog", { name: /^(Customer Signs|Report)$/ })).toBeVisible();
    await closeWrapUpStep(page);
  });
});
