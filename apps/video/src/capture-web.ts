// Captures the website's real screens for the launch film: the office side signed in as the
// shared demo company's owner (Canyon State Leak Detections, the same company the owner's iPhone
// recordings use; owner, 2026-10-23), and the customer pages a homeowner opens on a phone.
// Desktop at 1440 × 900 at 2×, phones at 393 × 852 at 3×. Writes captures/web/<name>.png and
// captures/web/boxes.json (where buttons sit, in image pixels, for tap rings and push-ins).
//
//   NODE_USE_ENV_PROXY=1 PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node src/capture-web.ts [name…]
//
// Against https://sundeckpro.com (config/supabase-dev.json `webUrl`, the dev project) unless
// CAPTURE_BASE_URL says otherwise. READ-ONLY: the demo company is shared, so nothing here saves
// anything. It opens Optimize Week's sheet but never presses it, types into no form, never
// signs out through the website (that would sign the owner's phone out too), and opens only
// customer links that have been opened before (a first open notifies the shop).

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { chromePath } from "./chrome.ts";
import { writeJson } from "./json.ts";

const root = join(import.meta.dirname, "..");
const repo = join(root, "..", "..");
const out = join(root, "captures", "web");
const dev = JSON.parse(readFileSync(join(repo, "config", "supabase-dev.json"), "utf8")) as {
  webUrl: string;
};
const BASE = process.env.CAPTURE_BASE_URL ?? dev.webUrl;
const ACCOUNTS = {
  demo: { email: "owner@demo.leakbook.test", password: "leakbook-demo" },
  canyon: { email: "marcus@canyonstate.video.test", password: "sundeck-video" },
} as const;
type Account = keyof typeof ACCOUNTS;

// Customer links (share_link tokens) on the two video shops, made by
// scripts/launch-video-seed.mjs: Rebecca Quinn's leak report, her quote (captured open, then
// again after `launch-video-seed.mjs --apply --accept` as accepted with its deposit) and her
// invoice at Canyon State; Caleb Pacheco's visit report at Blue Mesa. The demo company's own
// customer pages carry its office@demo… address and test data, so they're never used.
const LINKS = {
  report: "/r/722855c7a0ab3cd7226438567b777e9d",
  quoteOpen: "/q/391072222a7ef15e9ed008f4ca3479d5",
  quoteAccepted: "/q/391072222a7ef15e9ed008f4ca3479d5",
  invoiceOpen: "/i/75a5792c26d045811fa80a7eae421068",
  visitReport: "/r/973924b79806016606eb799e888a14a6",
};

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface CaptureInfo {
  width: number;
  height: number;
  scale: number;
  boxes: Record<string, Box>;
}

interface Shot {
  name: string;
  /** Signed in as this shop's owner; none for customer pages. */
  as?: Account;
  phone?: boolean;
  path: string;
  fullPage?: boolean;
  /** A full-page picture cut at this height (CSS pixels): the film never shows below it. */
  clipHeight?: number;
  /** Steps before the picture; returns named boxes to record. */
  before?: (page: Page) => Promise<Record<string, Box | null> | void>;
  /** More pictures from the same page after the first (e.g. a sheet, then its result). */
  more?: { name: string; step: (page: Page) => Promise<Record<string, Box | null> | void> }[];
}

const settle = async (page: Page, ms = 1500) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
};

/** Waits for the Mapbox maps on a page to draw their tiles (or gives up after a while). */
async function mapsDrawn(page: Page) {
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll(".mapboxgl-map")].every((m) =>
          m.classList.contains("mapboxgl-map") ? m.querySelector("canvas") !== null : true,
        ),
      undefined,
      { timeout: 15000 },
    )
    .catch(() => {});
  await page.waitForTimeout(4000);
}

async function boxOf(page: Page, selector: string | ReturnType<Page["locator"]>) {
  const loc = typeof selector === "string" ? page.locator(selector).first() : selector.first();
  const b = await loc.boundingBox().catch(() => null);
  if (!b) return null;
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  return { x: b.x + scroll.x, y: b.y + scroll.y, w: b.width, h: b.height };
}

/** Folds the Getting Started panel away (kept in this browser only; nothing is saved). */
async function quietDock(page: Page) {
  const min = page.getByRole("button", { name: "Minimize" });
  if (await min.count())
    await min
      .first()
      .click()
      .catch(() => {});
  await page.waitForTimeout(300);
}

/** Folds Needs a Time away (a disclosure in this browser only; nothing is saved). */
async function foldTray(page: Page) {
  const tray = page.getByRole("button", { name: /^Needs a Time/ }).first();
  if ((await tray.count()) && (await tray.getAttribute("aria-expanded")) === "true") {
    await tray.click();
    await page.waitForTimeout(600);
  }
}

const shots: Shot[] = [
  // 01 Dispatch: the week, Optimize Week's sheet (opened, never pressed), the day board.
  {
    name: "week",
    as: "demo",
    path: "/schedule?view=week",
    fullPage: true,
    clipHeight: 2000,
    before: async (page) => {
      await quietDock(page);
      await foldTray(page);
      await mapsDrawn(page);
      return {
        optimizeWeek: await boxOf(page, page.getByRole("button", { name: "Optimize Week" })),
      };
    },
    more: [
      {
        name: "week-optimize-sheet",
        step: async (page) => {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.getByRole("button", { name: "Optimize Week" }).first().click();
          await page.waitForTimeout(1200);
          const sheet = page.getByRole("dialog");
          const found = {
            sheet: await boxOf(page, sheet),
            confirm: await boxOf(page, sheet.getByRole("button", { name: "Optimize Week" })),
          };
          return found;
        },
      },
    ],
  },
  {
    name: "week-next",
    as: "demo",
    path: `/schedule?view=week&date=${nextMonday()}`,
    fullPage: true,
    clipHeight: 2000,
    before: async (page) => {
      await quietDock(page);
      await foldTray(page);
      await mapsDrawn(page);
    },
  },
  {
    name: "day",
    as: "demo",
    path: "/schedule",
    before: async (page) => {
      await quietDock(page);
      await mapsDrawn(page);
      return {
        needsATime: await boxOf(page, page.getByText("Needs a Time")),
        optimize: await boxOf(page, page.getByRole("button", { name: /^Optimize .*Route$/ })),
      };
    },
  },
  {
    name: "today",
    as: "demo",
    path: "/today",
    before: async (page) => {
      await quietDock(page);
      await mapsDrawn(page);
    },
  },
  {
    name: "dashboard",
    as: "demo",
    path: "/dashboard",
    fullPage: true,
    before: async (page) => {
      await quietDock(page);
      return {
        customers: await boxOf(page, page.getByText("Customers", { exact: true })),
        collected: await boxOf(page, page.getByText("Collected", { exact: true })),
        owed: await boxOf(page, page.getByText("Owed to you", { exact: true })),
        plan: await boxOf(page, page.getByText("On a plan", { exact: true })),
        quotes: await boxOf(page, page.getByText("Quotes accepted", { exact: true })),
        activity: await boxOf(page, page.getByRole("button", { name: /Activity/ })),
      };
    },
    more: [
      {
        name: "dashboard-activity",
        step: async (page) => {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page
            .getByRole("button", { name: /Activity/ })
            .first()
            .click();
          await page.waitForTimeout(1500);
          return { menu: await boxOf(page, page.locator("[role=menu], [role=dialog]")) };
        },
      },
    ],
  },
  { name: "customers", as: "demo", path: "/customers", before: quietDock },
  { name: "activity", as: "demo", path: "/activity", before: quietDock },
  { name: "invoices", as: "demo", path: "/invoices", before: quietDock },
  { name: "jobs", as: "demo", path: "/jobs", before: quietDock },
  {
    name: "email",
    as: "demo",
    path: "/customers/email",
    before: async (page) => {
      await quietDock(page);
      // Typed in this browser only; never sent.
      await page.getByLabel("Subject").fill("Spring opening: 15% off your first month");
      await page
        .locator("textarea")
        .first()
        .fill(
          "Hi {first name},\n\nPools open in three weeks. Book your spring opening now and your first month of weekly service is 15% off.\n\nReply to this email or call us to get on the schedule.",
        );
      await page.waitForTimeout(500);
      return {
        subject: await boxOf(page, page.getByLabel("Subject")),
        send: await boxOf(page, page.getByRole("button", { name: /^Send to/ })),
      };
    },
  },
  {
    // The Canyon State video shop's settings: the demo company's carry test terms.
    name: "vs-settings-reminders",
    as: "canyon",
    path: "/settings/company",
    before: async (page) => {
      await quietDock(page);
      await page.getByText("Reminders and Reviews").first().scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, 120));
      await page.waitForTimeout(600);
    },
  },
  // The money screens from the Canyon State video shop (read-only): the demo company's
  // dashboard has almost no history, and its invoices are test rows.
  {
    name: "vs-dashboard",
    as: "canyon",
    path: "/dashboard",
    fullPage: true,
    before: async (page) => ({
      customers: await boxOf(page, page.getByText("Customers", { exact: true })),
      collected: await boxOf(page, page.getByText("Collected", { exact: true })),
      owed: await boxOf(page, page.getByText("Owed to you", { exact: true })),
      quotes: await boxOf(page, page.getByText("Quotes accepted", { exact: true })),
      invoiced: await boxOf(page, page.getByText("Invoiced", { exact: true })),
      activity: await boxOf(page, page.getByRole("button", { name: /Activity/ })),
    }),
    more: [
      {
        name: "vs-dashboard-activity",
        step: async (page) => {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page
            .getByRole("button", { name: /Activity/ })
            .first()
            .click();
          await page.waitForTimeout(1500);
          return { menu: await boxOf(page, page.locator("[role=menu], [role=dialog]")) };
        },
      },
    ],
  },
  { name: "vs-invoices", as: "canyon", path: "/invoices" },
  {
    name: "vs-activity",
    as: "canyon",
    path: "/activity",
    fullPage: true,
    before: async (page) => ({
      quoteAccepted: await boxOf(page, page.getByText("Quote accepted").first()),
      payment: await boxOf(page, page.getByText("Payment received").first()),
    }),
  },
  // 04 Prove it: the homeowner's report, wide (as it opens on a computer) and on a phone.
  { name: "report-desktop", path: LINKS.report, fullPage: true },
  {
    name: "phone-report",
    phone: true,
    path: LINKS.report,
    fullPage: true,
    before: async (page) => ({
      found: await boxOf(page, page.getByText("What we found", { exact: true })),
    }),
  },
  // 05 Close it: the customer's quote with Accept, and one accepted with its deposit in.
  {
    name: "phone-quote-open",
    phone: true,
    path: LINKS.quoteOpen,
    fullPage: true,
    before: async (page) => ({
      accept: await boxOf(page, page.getByRole("button", { name: "Accept Quote" })),
      agree: await boxOf(page, page.getByRole("switch")),
      heading: await boxOf(page, page.getByText("Accept This Quote", { exact: true })),
    }),
  },
  {
    name: "phone-quote-accepted",
    phone: true,
    path: LINKS.quoteAccepted,
    fullPage: true,
    before: async (page) => ({
      heading: await boxOf(page, page.getByText("Accepted", { exact: true })),
      deposit: await boxOf(page, page.getByText(/^Deposit of .* received/)),
    }),
  },
  // 06 Every pool, every week: the homeowner's visit report (Blue Mesa, seeded by
  // scripts/launch-video-seed.mjs).
  { name: "phone-visit-report", phone: true, path: LINKS.visitReport, fullPage: true },
  // 08 Get paid: the invoice a customer pays by card.
  { name: "phone-invoice-open", phone: true, path: LINKS.invoiceOpen, fullPage: true },
];

/**
 * The capture browser's own touch-ups, nothing saved: the demo company's placeholder people get
 * their film names, the video shops' `.video.test` addresses read as real ones, and the
 * Dashboard's "+189 in 30 days" (every customer was imported this month) is left out.
 */
const RENAME: [string, string][] = [
  ["Dana Owner", "Dana Ruiz"],
  ["Tony Tech", "Tony Alvarez"],
  ["office@canyonstate.video.test", "office@canyonstateleak.com"],
  ["office@bluemesa.video.test", "office@bluemesapools.com"],
];

async function tidy(page: Page) {
  await page.evaluate((rename) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      let text = n.nodeValue ?? "";
      for (const [from, to] of rename) text = text.split(from).join(to);
      // The account button's initials.
      if (text === "DO" && n.parentElement?.closest("header, nav")) text = "DR";
      if (/^\+\d+ in 30 days$/.test(text.trim()) && n.parentElement) {
        n.parentElement.style.visibility = "hidden";
      }
      if (text !== n.nodeValue) n.nodeValue = text;
    }
    for (const e of document.querySelectorAll("input, textarea")) {
      const field = e as HTMLInputElement;
      let v = field.value;
      for (const [from, to] of rename) v = v.split(from).join(to);
      if (v !== field.value) field.value = v;
    }
  }, RENAME);
  await page.waitForTimeout(150);
}

/** Test data must never reach the film: a capture that shows any is refused. */
const TEST_DATA =
  /\be2e\b|\bmv[a-z0-9]{8,}|\bdemo\b|demo\.leakbook|Sam Sample|\.test\b|Sample terms/i;

async function refuseTestData(page: Page, name: string, below?: number) {
  // What shows: text on the page (not scripts or hidden parts) and what's in the fields.
  const text = await page.evaluate((limit) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest("script, style, noscript, template")) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden") continue;
      // A full page cut at `limit`, or (limit -1) only what's in the window.
      if (limit > 0 && r.top + window.scrollY > limit) continue;
      if (limit < 0 && (r.bottom < 0 || r.top > window.innerHeight)) continue;
      out.push(n.nodeValue ?? "");
    }
    for (const e of document.querySelectorAll("input, textarea"))
      out.push((e as HTMLInputElement).value);
    return out.join("\n");
  }, below ?? 0);
  const bad = text.match(new RegExp(`[^\\n]*(${TEST_DATA.source})[^\\n]*`, "i"));
  if (bad) throw new Error(`${name} shows test data: "${bad[0].trim().slice(0, 90)}"`);
}

/** Next Monday in Phoenix, as YYYY-MM-DD. */
function nextMonday(): string {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" }));
  const add = (8 - today.getDay()) % 7 || 7;
  today.setDate(today.getDate() + add);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

async function signIn(browser: Browser, account: Account): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    timezoneId: "America/Phoenix",
    locale: "en-US",
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel("Email").fill(ACCOUNTS[account].email);
  await page.getByLabel("Password").fill(ACCOUNTS[account].password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 30000 });
  await page.close();
  return ctx;
}

async function main() {
  const only = process.argv.slice(2);
  mkdirSync(out, { recursive: true });
  const boxesFile = join(out, "boxes.json");
  const boxes: Record<string, CaptureInfo> = existsSync(boxesFile)
    ? JSON.parse(readFileSync(boxesFile, "utf8"))
    : {};
  const browser = await chromium.launch({
    executablePath: chromePath(),
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
  });
  const contexts = new Map<string, BrowserContext>();
  const contextFor = async (shot: Shot) => {
    const key = shot.as ?? (shot.phone ? "phone" : "guest");
    let ctx = contexts.get(key);
    if (!ctx) {
      ctx = shot.as
        ? await signIn(browser, shot.as)
        : await browser.newContext(
            shot.phone
              ? {
                  viewport: { width: 393, height: 852 },
                  deviceScaleFactor: 3,
                  isMobile: true,
                  hasTouch: true,
                  timezoneId: "America/Phoenix",
                }
              : {
                  viewport: { width: 1440, height: 900 },
                  deviceScaleFactor: 2,
                  timezoneId: "America/Phoenix",
                },
          );
      contexts.set(key, ctx);
    }
    return ctx;
  };

  for (const shot of shots) {
    if (only.length && !only.some((o) => shot.name.startsWith(o))) continue;
    const ctx = await contextFor(shot);
    const page = await ctx.newPage();
    try {
      await page
        .goto(BASE + shot.path, { waitUntil: "networkidle", timeout: 60000 })
        .catch(() => {});
      await settle(page);
      const save = async (name: string, found: Record<string, Box | null> | void, full = false) => {
        const file = join(out, `${name}.png`);
        await tidy(page);
        const clip = full ? shot.clipHeight : undefined;
        await refuseTestData(page, name, full ? clip : -1);
        await page.screenshot(
          clip
            ? { path: file, fullPage: true, clip: { x: 0, y: 0, width: 1440, height: clip } }
            : { path: file, fullPage: full },
        );
        const scale = shot.phone ? 3 : 2;
        const size = await page.evaluate(
          (f) =>
            f
              ? {
                  w: document.documentElement.scrollWidth,
                  h: document.documentElement.scrollHeight,
                }
              : { w: window.innerWidth, h: window.innerHeight },
          full,
        );
        const named: Record<string, Box> = {};
        for (const [k, b] of Object.entries(found ?? {})) {
          if (b) named[k] = { x: b.x * scale, y: b.y * scale, w: b.w * scale, h: b.h * scale };
        }
        const height = clip ? Math.min(clip, size.h) : size.h;
        boxes[name] = { width: size.w * scale, height: height * scale, scale, boxes: named };
        console.log(`  ${name}.png  ${Object.keys(named).join(", ")}`);
      };
      await save(shot.name, await shot.before?.(page), shot.fullPage);
      for (const m of shot.more ?? []) await save(m.name, await m.step(page), false);
    } catch (e) {
      console.error(`  ${shot.name}: ${(e as Error).message.split("\n")[0]}`);
    } finally {
      await page.close();
    }
  }
  await writeJson(boxesFile, boxes);
  await browser.close();
}

await main();
