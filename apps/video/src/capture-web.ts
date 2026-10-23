// Captures the website's real screens for the launch film: the office side signed in as the
// Canyon State video shop's owner (Marcus Hale; the pool chapter's week as Blue Mesa's owner),
// and the customer pages a homeowner opens on a phone. Desktop at 1440 × 900 at 2×, phones at
// 393 × 852 at 3×. Writes captures/web/<name>.png and captures/web/boxes.json (where buttons
// sit, in image pixels, for tap rings and push-ins, and figures the film counts up to).
//
//   NODE_USE_ENV_PROXY=1 PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node src/capture-web.ts [name…]
//
// Against https://sundeckpro.com (config/supabase-dev.json `webUrl`, the dev project) unless
// CAPTURE_BASE_URL says otherwise. Nothing is sent or saved except the Dispatch sequence, which
// really moves and optimizes the Canyon State video shop's next week (snapshot it before with
// `scripts/launch-video-seed.mjs --snapshot-week`, put it back after with `--restore-week
// --apply`). It types an offer into Email Customers and a review link into Settings without
// sending or saving them, and never signs out through the website.

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
  canyon: { email: "marcus@canyonstate.video.test", password: "sundeck-video" },
  bluemesa: { email: "erin@bluemesa.video.test", password: "sundeck-video" },
} as const;
type Account = keyof typeof ACCOUNTS;

// Customer links (share_link tokens) on the two video shops, made by
// scripts/launch-video-seed.mjs: Rebecca Quinn's leak report, her quote (captured open, then
// again after `launch-video-seed.mjs --apply --accept` as accepted with its deposit) and her
// invoice at Canyon State; Caleb Pacheco's visit report at Blue Mesa. The demo company's own
// customer pages carry its office@demo… address and test data, so they're never used.
const LINKS = {
  report: "/r/dd031676ac80e7b8278ccb8ebf131e0e",
  quoteOpen: "/q/4e30dc22e0e36c8325686f34cac27969",
  quoteAccepted: "/q/4e30dc22e0e36c8325686f34cac27969",
  invoiceOpen: "/i/496c6c1333173f2014f79a68e46a7d58",
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
  /** Text read off the page (a figure the film counts up to). */
  texts?: Record<string, string>;
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
  /** Text to read off the page, by name. */
  texts?: (page: Page) => Promise<Record<string, string>>;
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

/**
 * A drag the way a mouse does it: press on the card's handle, a small move to start, the way
 * over, release. The board drops a card where the card's middle lands, so the pointer aims the
 * handle's offset from the card's middle past the target.
 */
async function dragTo(
  page: Page,
  handle: ReturnType<Page["locator"]>,
  to: { x: number; y: number },
) {
  const from = await handle.boundingBox();
  if (!from) throw new Error("No handle to drag");
  const offset = await handle.evaluate((el) => {
    let card: Element | null = el;
    while (card && card.getBoundingClientRect().width < 150) card = card.parentElement;
    const r = (card ?? el).getBoundingClientRect();
    const h = el.getBoundingClientRect();
    return h.x + h.width / 2 - (r.x + r.width / 2);
  });
  const sx = from.x + from.width / 2;
  const sy = from.y + from.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 10, sy + 10, { steps: 4 });
  await page.mouse.move(to.x + offset, to.y, { steps: 30 });
  await page.waitForTimeout(500);
  await page.mouse.up();
  // The board works out the new drive times after a move.
  await settle(page, 7000);
}

/** The middle of a day's cell in a tech's row on the Week board (viewport pixels). */
async function cell(page: Page, tech: string, day: string) {
  const col = await page.getByText(day, { exact: true }).first().boundingBox();
  const row = await page.locator("span", { hasText: tech }).last().boundingBox();
  if (!col || !row) throw new Error(`No cell for ${tech} on ${day}`);
  return { x: col.x + 96, y: row.y + row.height / 2 + 6 };
}

const shots: Shot[] = [
  // 01 Dispatch, done for real on the Canyon State video shop's next week (run
  // `launch-video-seed.mjs --snapshot-week` first and `--restore-week --apply` after): Laura
  // Bennett's new leak detection dropped from Needs a Time onto Tuesday, then dragged to Jake,
  // then Optimize Week and its result. The window is tall enough to show the whole board.
  {
    name: "dispatch-0",
    as: "canyon",
    path: `/schedule?view=week&date=${nextMonday()}`,
    before: async (page) => {
      await page.setViewportSize({ width: 1440, height: 1180 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await quietDock(page);
      await mapsDrawn(page);
      return {
        laura: await boxOf(page, page.getByRole("button", { name: "Drag Laura Bennett" })),
        lauraCard: await boxOf(page, page.getByText("Laura Bennett").first()),
        tray: await boxOf(page, page.getByRole("button", { name: /^Needs a Time/ })),
        optimizeWeek: await boxOf(page, page.getByRole("button", { name: "Optimize Week" })),
        board: await boxOf(page, page.getByText("Tech", { exact: true })),
      };
    },
    more: [
      {
        name: "dispatch-1",
        step: async (page) => {
          const handle = page.getByRole("button", { name: "Drag Laura Bennett" }).first();
          await dragTo(page, handle, await cell(page, "Dana Ruiz", "Tue, Oct 27"));
          return {
            laura: await boxOf(page, page.getByRole("button", { name: "Drag Laura Bennett" })),
            lauraCard: await boxOf(page, page.getByText("Laura Bennett").first()),
          };
        },
      },
      {
        name: "dispatch-2",
        step: async (page) => {
          const handle = page.getByRole("button", { name: "Drag Laura Bennett" }).first();
          await dragTo(page, handle, await cell(page, "Jake Turner", "Tue, Oct 27"));
          return {
            laura: await boxOf(page, page.getByRole("button", { name: "Drag Laura Bennett" })),
            lauraCard: await boxOf(page, page.getByText("Laura Bennett").first()),
          };
        },
      },
      {
        name: "dispatch-3",
        step: async (page) => {
          await page.getByRole("button", { name: "Optimize Week" }).first().click();
          await page.waitForTimeout(1200);
          const sheet = page.getByRole("dialog");
          // Every tech's week, not just the one whose maps are showing.
          await sheet.getByText("Everyone", { exact: true }).click();
          await page.waitForTimeout(600);
          return {
            sheet: await boxOf(page, sheet),
            everyone: await boxOf(page, sheet.getByText("Everyone", { exact: true })),
            confirm: await boxOf(page, sheet.getByRole("button", { name: "Optimize Week" })),
          };
        },
      },
      {
        name: "dispatch-4",
        step: async (page) => {
          await page.getByRole("dialog").getByRole("button", { name: "Optimize Week" }).click();
          await page
            .getByText(/less driving|best order/)
            .first()
            .waitFor({ timeout: 60000 });
          await settle(page, 2500);
          await mapsDrawn(page);
          return {
            banner: await boxOf(page, page.getByText(/less driving|best order/).first()),
            lauraCard: await boxOf(page, page.getByText("Laura Bennett").first()),
          };
        },
      },
    ],
  },
  {
    name: "email",
    as: "canyon",
    path: "/customers/email",
    before: async (page) => {
      await quietDock(page);
      // Typed in this browser only; never sent.
      await page
        .getByLabel("Subject")
        .fill("Fall tune-up: a free equipment check with any repair this month");
      await page
        .locator("textarea")
        .first()
        .fill(
          "Hi {first name},\n\nCooler days are the best time to fix a leak before winter. Book any repair with us this month and we'll check your pump, filter and heater for free.\n\nReply to this email or call us to get on the schedule.",
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
      // The shop's review page, typed in this browser only (never saved), so the review request
      // has somewhere to send customers.
      await page.getByLabel("Review link").fill("g.page/r/canyonstateleak/review");
      await page.getByLabel("Review link").blur();
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
      // The card's own figure, for the film's count-up on it.
      collectedValue: await boxOf(
        page,
        page.getByText("Collected", { exact: true }).locator("xpath=following-sibling::*[1]"),
      ),
      owed: await boxOf(page, page.getByText("Owed to you", { exact: true })),
      quotes: await boxOf(page, page.getByText("Quotes accepted", { exact: true })),
      invoiced: await boxOf(page, page.getByText("Invoiced", { exact: true })),
      activity: await boxOf(page, page.getByRole("button", { name: /Activity/ })),
    }),
    texts: async (page) => ({
      collected: (
        await page
          .getByText("Collected", { exact: true })
          .locator("xpath=following-sibling::*[1]")
          .first()
          .innerText()
      ).trim(),
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
  {
    name: "vs-invoices",
    as: "canyon",
    path: "/invoices",
    before: async (page) => ({
      rebecca: await boxOf(page, page.getByText("Rebecca Quinn").first()),
    }),
    more: [
      {
        // The paid ones: what's come in.
        name: "vs-invoices-paid",
        step: async (page) => {
          await page
            .locator("a, button, [role=tab], [role=radio], label")
            .filter({ hasText: /^\s*Paid\s*\d/ })
            .first()
            .click();
          await settle(page, 2500);
          return { list: await boxOf(page, page.getByText("Paid", { exact: true }).nth(1)) };
        },
      },
    ],
  },
  // 06 Every pool, every week: Blue Mesa (the pool video shop) this week, its plans on the board.
  {
    name: "bm-week",
    as: "bluemesa",
    path: "/schedule?view=week",
    fullPage: true,
    clipHeight: 1600,
    before: async (page) => {
      await quietDock(page);
      await mapsDrawn(page);
      return { board: await boxOf(page, page.getByText("Tech", { exact: true })) };
    },
  },
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
  {
    name: "report-desktop",
    path: LINKS.report,
    fullPage: true,
    before: async (page) => ({
      found: await boxOf(page, page.getByText("What we found", { exact: true })),
      photos: await boxOf(page, page.getByText("Photos", { exact: true })),
      photo: await boxOf(page, page.locator("img[alt*='ight']").first()),
      signatures: await boxOf(page, page.getByText("Signatures", { exact: true })),
    }),
  },
  {
    name: "phone-report",
    phone: true,
    path: LINKS.report,
    fullPage: true,
    before: async (page) => ({
      found: await boxOf(page, page.getByText("What we found", { exact: true })),
      photos: await boxOf(page, page.getByText("Photos", { exact: true })),
      signatures: await boxOf(page, page.getByText("Signatures", { exact: true })),
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
  // The same page ready to accept: the terms switch turned on in this browser. Never submitted.
  {
    name: "phone-quote-agreed",
    phone: true,
    path: LINKS.quoteOpen,
    fullPage: true,
    before: async (page) => {
      const agree = page.getByRole("switch");
      await agree.click();
      if (!(await agree.isChecked())) {
        throw new Error("phone-quote-agreed: the terms switch didn't turn on");
      }
      return {
        accept: await boxOf(page, page.getByRole("button", { name: "Accept Quote" })),
        agree: await boxOf(page, agree),
        heading: await boxOf(page, page.getByText("Accept This Quote", { exact: true })),
      };
    },
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
  // 08 Get paid: Rebecca's invoice (not in the film while the shop has no card payments).
  { name: "phone-invoice-open", phone: true, path: LINKS.invoiceOpen, fullPage: true },
];

/**
 * The capture browser's own touch-ups, nothing saved: the video shops' `.video.test` addresses
 * read as real ones, and the Dashboard's "+N in 30 days" (every customer was imported this
 * month) is left out.
 */
const RENAME: [string, string][] = [
  ["office@canyonstate.video.test", "office@canyonstateleak.com"],
  ["office@bluemesa.video.test", "office@bluemesapools.com"],
];

async function tidy(page: Page) {
  await page.evaluate((rename) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      let text = n.nodeValue ?? "";
      for (const [from, to] of rename) text = text.split(from).join(to);
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
        boxes[name] = {
          width: size.w * scale,
          height: height * scale,
          scale,
          boxes: named,
          ...(name === shot.name && shot.texts ? { texts: await shot.texts(page) } : {}),
        };
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
