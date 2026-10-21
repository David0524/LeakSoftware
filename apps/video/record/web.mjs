// Captures the website's real screens for the demo videos: sharp PNGs (2× pixels) of each
// state a scene shows, plus where the tapped controls are, so the video can put its tap ring
// on the real button. Runs against a local `next start` of apps/web on the dev project, signed
// in as the video shops' owners (scripts/video-seed.mjs). Writes assets/generated/web/.
//
//   node record/web.mjs [--base http://localhost:3300] [shot names...]
//
// Run with NODE_USE_ENV_PROXY=1 in cloud sessions (share links are looked up on the dev
// project through the Management API). Only real actions a user takes: tips are dismissed with their ×, Optimize is pressed.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(app, "assets/generated/web");
mkdirSync(out, { recursive: true });

const args = process.argv.slice(2);
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3300";
const only = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--base");

const PASSWORD = "sundeck-video";
const MARCUS = "marcus@canyonstate.video.test";
const ERIN = "erin@bluemesa.video.test";

const DESKTOP = { viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 };
// iPhone 17: 402 × 874 points at 3×.
const PHONE = {
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

/** The dates the shots need, in the shops' time zone. */
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(new Date());
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
const thisMonday = addDays(today, -((weekday + 6) % 7));
const nextMonday = addDays(thisMonday, 7);

/** A customer's share link (report, quote or invoice), looked up on the dev project. */
async function shareToken(company, customer, kind) {
  const ref = JSON.parse(
    readFileSync(join(app, "../../config/supabase-dev.json"), "utf8"),
  ).projectRef;
  const sql = `select s.token from share_link s join job j on j.id = s.job_id
    join customer c on c.id = j.bill_to_customer_id
    where s.company_id = '${company}' and c.name = '${customer}' and s.${kind}_id is not null
      and s.deleted_at is null and s.revoked_at is null
    order by s.created_at desc limit 1`;
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const rows = await res.json();
  if (!res.ok || !rows[0])
    throw new Error(`no ${kind} link for ${customer}: ${JSON.stringify(rows)}`);
  return rows[0].token;
}
const CANYON = "00000000-0000-4000-9000-00000000c501";
const BLUE_MESA = "00000000-0000-4000-9000-00000000c502";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium",
});

async function context(device, who) {
  const ctx = await browser.newContext({ ...device, baseURL: base, colorScheme: "light" });
  const page = await ctx.newPage();
  if (who) {
    await page.goto("/sign-in?next=/dashboard");
    await page.getByLabel("Email").fill(who);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.waitForURL((u) => u.pathname !== "/sign-in", { timeout: 60_000 });
  }
  return { ctx, page };
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  // Tips are one-time cards; a real owner closes them. "Getting Started" too.
  for (const close of await page.getByRole("button", { name: /^(Dismiss|Close)/ }).all()) {
    if (await close.isVisible().catch(() => false)) await close.click().catch(() => {});
  }
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1200);
}

/** Saves the screen (or the whole page) and the boxes of the named controls, in CSS pixels. */
async function shot(page, name, targets = {}, { fullPage = false } = {}) {
  const boxes = {};
  for (const [key, locator] of Object.entries(targets)) {
    const box = await locator.boundingBox();
    if (box) boxes[key] = box;
  }
  await page.screenshot({ path: join(out, `${name}.png`), fullPage });
  const size = fullPage
    ? await page.evaluate(() => ({
        width: innerWidth,
        height: document.documentElement.scrollHeight,
      }))
    : page.viewportSize();
  writeFileSync(join(out, `${name}.json`), JSON.stringify({ size, boxes }, null, 2));
  console.log("captured", name);
}

/** The Week board, Optimize Week's sheet, and the board after it. Run right after a seed:
 * a second run finds nothing left to move. */
async function optimizeWeek(page, prefix, date) {
  await page.goto(`/schedule?view=week&date=${date}`);
  await settle(page);
  const optimize = page.getByRole("button", { name: "Optimize Week" });
  await shot(page, `${prefix}-week`, { optimize });
  await optimize.click();
  const confirm = page.getByRole("dialog").getByRole("button", { name: "Optimize Week" });
  await confirm.waitFor();
  await page.waitForTimeout(800);
  await shot(page, `${prefix}-week-optimize`, { confirm });
  await confirm.click();
  await page
    .getByText(/^Optimizing/)
    .waitFor({ state: "detached", timeout: 120_000 })
    .catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, `${prefix}-week-optimized`);
}

const shots = {
  async leakSchedule() {
    const { ctx, page } = await context(DESKTOP, MARCUS);
    await page.goto(`/schedule?view=day&date=${today}`);
    await settle(page);
    await shot(page, "leak-day");
    await optimizeWeek(page, "leak", nextMonday);
    await ctx.close();
  },
  async leakOwner() {
    const { ctx, page } = await context(DESKTOP, MARCUS);
    await page.goto("/dashboard");
    await settle(page);
    const activity = page.getByRole("button", { name: /^Activity/ }).first();
    await shot(page, "leak-dashboard", { activity });
    await activity.click();
    await page.waitForTimeout(1200);
    await shot(page, "leak-dashboard-activity");
    await page.goto("/activity");
    await settle(page);
    await shot(page, "leak-activity");
    await ctx.close();
  },
  async leakCustomer() {
    const { ctx, page } = await context(PHONE);
    await page.goto(`/r/${await shareToken(CANYON, "Gregory Lin", "report")}`);
    await settle(page);
    await shot(page, "leak-customer-report", {}, { fullPage: true });
    await page.goto(`/q/${await shareToken(CANYON, "Gregory Lin", "quote")}`);
    await settle(page);
    await shot(page, "leak-customer-quote", {}, { fullPage: true });
    await ctx.close();
  },
  async poolSchedule() {
    const { ctx, page } = await context(DESKTOP, ERIN);
    await optimizeWeek(page, "pool", nextMonday);
    await ctx.close();
  },
  async poolCustomer() {
    const { ctx, page } = await context(PHONE);
    await page.goto(`/q/${await shareToken(BLUE_MESA, "Caleb Pacheco", "quote")}`);
    await settle(page);
    await shot(page, "pool-customer-quote", {}, { fullPage: true });
    await ctx.close();
  },
  async poolOwner() {
    const { ctx, page } = await context(DESKTOP, ERIN);
    await page.goto("/invoices");
    await settle(page);
    await shot(page, "pool-invoices");
    await page.goto("/dashboard");
    await settle(page);
    await shot(page, "pool-dashboard");
    await ctx.close();
  },
};

for (const [name, run] of Object.entries(shots)) {
  if (only.length && !only.includes(name)) continue;
  await run();
}
await browser.close();
