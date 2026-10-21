import { devices, expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedInClient } from "./backend";
import { OWNER, RUN, TECH, signIn } from "./helpers";
import { SAMPLE_JOB } from "./money";

// Large text (owner, 2026-10-20): with the browser's text at 200%, or the page zoomed to 200%
// (a phone-width page half as wide), the job page's header and section switcher must not
// overlap, and nothing may scroll the page sideways. As iOS does with Dynamic Type: the back
// label gives way before the title, and the switcher scrolls inside its track.

type Box = { left: number; right: number; top: number; bottom: number };
const intersects = (a: Box, b: Box) =>
  a.left < b.right - 0.5 &&
  b.left < a.right - 0.5 &&
  a.top < b.bottom - 0.5 &&
  b.top < a.bottom - 0.5;

async function sideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/** The phone header and section switcher, checked on every section of the sample job. */
async function checkJobPage(page: Page) {
  const tabs = page.getByRole("tablist", { name: "Job sections" }).getByRole("tab");
  await expect(tabs).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    const tab = tabs.nth(i);
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    expect(await sideways(page), `section ${i + 1} scrolls sideways`).toBeLessThanOrEqual(0);
  }

  // Each label fits inside its own segment, and no two segments overlap.
  const segments = await tabs.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        label: el.textContent ?? "",
        fits: el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1,
        box: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      };
    }),
  );
  for (const [i, s] of segments.entries()) {
    expect(s.fits, `"${s.label}" overflows its segment`).toBe(true);
    const next = segments[i + 1];
    if (next)
      expect(intersects(s.box, next.box), `"${s.label}" overlaps "${next.label}"`).toBe(false);
  }

  // Scrolled down, the small title shows in the navigation bar next to "‹ Jobs".
  await tabs.first().click();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const bar = page.locator(".nav-main");
  const title = bar.locator("p");
  await expect(title).toHaveCSS("opacity", "1");
  const back = bar.getByRole("link", { name: "Jobs" });
  await expect(back).toBeVisible();
  const [backBox, titleBox] = await Promise.all([back.boundingBox(), title.boundingBox()]);
  const box = (b: { x: number; y: number; width: number; height: number }) => ({
    left: b.x,
    right: b.x + b.width,
    top: b.y,
    bottom: b.y + b.height,
  });
  expect(intersects(box(backBox!), box(titleBox!)), "the title overlaps ‹ Jobs").toBe(false);
  expect(await sideways(page)).toBeLessThanOrEqual(0);
}

/** The shop's date today (the demo shop is in Phoenix, UTC−7 all year). */
function shopToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(new Date());
}

// Today is checked with a stop on it, its card and row included, whatever the demo data has
// today: one stop for the demo tech, removed afterwards.
let owner: SupabaseClient;
let stop: string | null = null;
test.beforeAll(async () => {
  owner = await signedInClient(OWNER.email, OWNER.password);
  const { data: tech } = await owner.from("profile").select("id").eq("email", TECH.email).single();
  const { data: who } = await owner.auth.getUser();
  const { data: membership } = await owner
    .from("membership")
    .select("company_id")
    .eq("user_id", who.user!.id)
    .limit(1)
    .single();
  const start = `${shopToday()}T23:30:00-07:00`;
  const { data: id, error } = await owner.rpc("create_job", {
    target_company: membership!.company_id,
    new_customer: { name: `Large Text ${RUN}`, phone: "602-555-0142" },
    existing_customer: null,
    new_property: {
      address_line1: "455 N Galvin Pkwy",
      city: "Phoenix",
      state: "AZ",
      postal_code: "85008",
      has_spa: false,
      access_notes: "Side gate code 4321; the dog stays inside.",
    },
    existing_property: null,
    job: {
      status: "scheduled",
      scheduled_start: start,
      scheduled_end: new Date(Date.parse(start) + 20 * 60_000).toISOString(),
      assigned_user_id: tech!.id,
    },
    components: [],
  });
  if (error) throw error;
  stop = id as string;
});

test.afterAll(async () => {
  if (stop) await owner.from("job").update({ deleted_at: new Date().toISOString() }).eq("id", stop);
});

for (const [name, viewport, fontSize] of [
  ["text at 200%", { width: 390, height: 844 }, "200%"],
  ["zoomed to 200%", { width: 195, height: 422 }, null],
] as const) {
  test(`on a phone with ${name}: the job header and sections don't overlap`, async ({
    browser,
  }) => {
    const phone = await browser.newContext({
      viewport,
      isMobile: true,
      hasTouch: true,
      userAgent: devices["iPhone 13"].userAgent,
    });
    const page = await phone.newPage();
    await signIn(page, TECH);
    await page.goto(`/jobs/${SAMPLE_JOB}`);
    if (fontSize) await page.addStyleTag({ content: `html { font-size: ${fontSize}; }` });
    await checkJobPage(page);

    // The tab bar's tabs stay side by side without running into each other.
    const tabBar = await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link")
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        }),
      );
    for (let i = 1; i < tabBar.length; i++)
      expect(intersects(tabBar[i - 1]!, tabBar[i]!), `tab ${i} overlaps tab ${i + 1}`).toBe(false);

    for (const path of ["/today", "/schedule", "/jobs"]) {
      await page.goto(path);
      if (fontSize) await page.addStyleTag({ content: `html { font-size: ${fontSize}; }` });
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1).toBeVisible();
      // While it loads (its placeholder screen) and once it has.
      expect(await sideways(page), `${path} scrolls sideways`).toBeLessThanOrEqual(0);
      await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
      if (path === "/today") await expect(page.getByTestId("today-hero")).toBeVisible();
      expect(await sideways(page), `${path} scrolls sideways once loaded`).toBeLessThanOrEqual(0);
      // The large title never runs into the "+" (on these pages it sits under the bar).
      const plus = page.locator(".nav-main").getByRole("link", { name: "New Job" });
      if (await plus.count()) {
        const plusBox = (await plus.boundingBox())!;
        // The text itself: the heading's box runs under the "+" as its padding.
        const text = await h1.evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const r = range.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        });
        const plusEdges = {
          left: plusBox.x,
          right: plusBox.x + plusBox.width,
          top: plusBox.y,
          bottom: plusBox.y + plusBox.height,
        };
        expect(intersects(plusEdges, text), `${path}: the title overlaps +`).toBe(false);
      }
      // A tab's own page has the logo at the bar's left, level with the "+", and the title
      // under it on its own row (owner, 2026-10-21), never over it.
      const logo = page.locator("[data-nav-brand] img:visible");
      await expect(logo).toHaveCount(1);
      const logoBox = (await logo.boundingBox())!;
      const titleText = await h1.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const r = range.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
      const logoEdges = {
        left: logoBox.x,
        right: logoBox.x + logoBox.width,
        top: logoBox.y,
        bottom: logoBox.y + logoBox.height,
      };
      expect(intersects(logoEdges, titleText), `${path}: the title overlaps the logo`).toBe(false);
      expect(titleText.top, `${path}: the title is under the logo's row`).toBeGreaterThanOrEqual(
        logoBox.y + logoBox.height,
      );
    }
    await phone.close();
  });
}
