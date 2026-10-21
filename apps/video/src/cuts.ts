// The two videos' scenes, on real screens: website captures from record/web.mjs (desktop at
// 1680 × 1050, 2×; customer pages on an iPhone-sized window, 3×) and the iPhone app's own
// screens (the VideoShots suite, 3×). Times are seconds into each 5.625 s scene.
import type { Screen, StatusBar } from "./screens";
import { brand, neutral } from "./theme";

export type Scene = {
  title: string;
  caption: string;
  desktop?: Screen;
  phone?: Screen & { statusBar?: StatusBar; who?: string };
};

export type Cut = {
  id: "leak" | "pool";
  track: string;
  opener: string;
  tagline: string;
  scenes: Scene[];
};

const DESKTOP = { width: 1680, height: 1050 };
const PHONE = { width: 402, height: 874 };
const web = (name: string) => `generated/web/${name}.png`;
const ios = (name: string) => `generated/ios/${name}.png`;
const navyBar: StatusBar = { background: brand.navy, color: brand.paper };
const lightBar: StatusBar = { background: neutral[50], color: brand.navy };

/** The tech's iPhone: the app's own screens, with the status bar drawn over their top. */
function iphone(frames: Screen["frames"], extra: Partial<Screen> = {}): Scene["phone"] {
  return { size: PHONE, scale: 3, statusBar: lightBar, who: "Tech", frames, ...extra };
}

/** A customer's phone: a website capture in Safari. */
function customer(frames: Screen["frames"], extra: Partial<Screen> = {}): Scene["phone"] {
  return {
    size: PHONE,
    scale: 3,
    statusBar: lightBar,
    who: "Customer",
    frames: frames.map((f) => ({ web: true, ...f })),
    ...extra,
  };
}

/** Optimize Week on the Week board: press it, confirm in the sheet, the board after. */
function optimizeWeek(prefix: string, url: string, toastY: number): Screen {
  return {
    size: DESKTOP,
    scale: 2,
    url,
    frames: [
      { src: web(`${prefix}-week`), at: 0 },
      { src: web(`${prefix}-week-optimize`), at: 1.55 },
      { src: web(`${prefix}-week-optimized`), at: 3.05 },
    ],
    taps: [
      { at: 1.4, box: "optimize", frame: web(`${prefix}-week`) },
      { at: 2.9, box: "confirm", frame: web(`${prefix}-week-optimize`) },
    ],
    camera: [
      { at: 0.6, zoom: 1.15, x: 900, y: 520 },
      { at: 1.3, zoom: 1.35, x: 1350, y: 400 },
      { at: 2.3, zoom: 1.45, x: 840, y: 520 },
      { at: 3.6, zoom: 1.6, x: 860, y: toastY },
    ],
  };
}

export const leak: Cut = {
  id: "leak",
  track: "generated/leak.wav",
  opener: "For leak detection shops",
  tagline: "Find it. Prove it. Get paid.",
  scenes: [
    {
      title: "Book and route",
      caption: "Book it. Optimize the route.",
      desktop: optimizeWeek("leak", "sundeckpro.com/schedule", 200),
    },
    {
      title: "On the way",
      caption: "Your tech's day, on the Lock Screen",
      phone: iphone(
        [
          { src: ios("leak-01-today"), at: 0 },
          { src: ios("leak-02-today-on-my-way-sent"), at: 1.3 },
          { src: ios("leak-03-live-activity-driving-island-over-today"), at: 2.2 },
          { src: ios("leak-03-live-activity-driving-lock-screen"), at: 3.4, bar: null },
        ],
        { taps: [{ at: 1.15, x: 242, y: 688 }] },
      ),
    },
    {
      title: "The test",
      caption: "Every test, every finding, recorded",
      phone: iphone(
        [
          { src: ios("leak-10-checklist"), at: 0 },
          { src: ios("leak-12-pressure-test-dropped"), at: 1.0 },
          { src: ios("leak-13-checklist-leaking"), at: 2.8 },
          { src: ios("leak-21-finding-light-niche-photo"), at: 4.0 },
        ],
        {
          taps: [{ at: 2.6, x: 201, y: 807 }],
          camera: [
            { at: 1.8, zoom: 1.3, x: 155, y: 600 },
            { at: 2.4, zoom: 1, x: 201, y: 437 },
          ],
        },
      ),
    },
    {
      title: "Report and quote",
      caption: "A clear report. A quote on the spot.",
      phone: iphone(
        [
          { src: ios("leak-36-review-with-customer"), at: 0 },
          { src: ios("leak-33-wrap-up-report-sent"), at: 1.6 },
          { src: ios("leak-34-wrap-up-quote-sent"), at: 3.4 },
        ],
        { taps: [{ at: 3.2, x: 108, y: 658 }] },
      ),
    },
    {
      title: "Customer pays",
      caption: "Accepted and paid before you leave",
      desktop: {
        size: DESKTOP,
        scale: 2,
        url: "sundeckpro.com/activity",
        frames: [{ src: web("leak-activity"), at: 0 }],
        camera: [{ at: 2.8, zoom: 1.6, x: 600, y: 330 }],
      },
      phone: customer([
        {
          src: web("leak-customer-quote"),
          at: 0,
          scroll: { from: 0, to: 600, start: 0.5, end: 2.0 },
        },
      ]),
    },
    {
      title: "The owner's view",
      caption: "See the whole business at a glance",
      desktop: {
        size: DESKTOP,
        scale: 2,
        url: "sundeckpro.com/dashboard",
        frames: [
          { src: web("leak-dashboard"), at: 0 },
          { src: web("leak-dashboard-activity"), at: 3.15 },
        ],
        taps: [{ at: 3.0, box: "activity", frame: web("leak-dashboard") }],
        camera: [
          { at: 1.2, zoom: 1.35, x: 700, y: 330 },
          { at: 2.7, zoom: 1.3, x: 1150, y: 330 },
          { at: 4.2, zoom: 1.55, x: 1200, y: 330 },
        ],
      },
    },
  ],
};

export const pool: Cut = {
  id: "pool",
  track: "generated/pool.wav",
  opener: "For pool service companies",
  tagline: "Every pool. Every week. On autopilot.",
  scenes: [
    {
      title: "Plans and routes",
      caption: "Weekly routes that build themselves",
      desktop: optimizeWeek("pool", "sundeckpro.com/schedule", 200),
    },
    {
      title: "The day",
      caption: "12 stops, live on the Lock Screen",
      phone: iphone([
        { src: ios("pool-01-today-stop-3"), at: 0 },
        { src: ios("pool-03-live-activity-driving-island-over-today"), at: 1.6 },
        { src: ios("pool-03-live-activity-driving-lock-screen"), at: 3.2, bar: null },
      ]),
    },
    {
      title: "The visit",
      caption: "Readings in. What to add, worked out.",
      phone: iphone(
        [
          { src: ios("pool-12-chemical-readings"), at: 0 },
          { src: ios("pool-13-chemical-what-to-add"), at: 1.4 },
          { src: ios("pool-14-visit-checklist-readings-in"), at: 2.9 },
          { src: ios("pool-16-before-after-photos"), at: 4.0 },
        ],
        { taps: [{ at: 2.7, x: 199, y: 726 }] },
      ),
    },
    {
      title: "Next stop",
      caption: "Mark Complete. The next stop's ready.",
      phone: iphone(
        [
          { src: ios("pool-20-today-mark-complete"), at: 0 },
          { src: ios("pool-21-today-sofia-done"), at: 1.4 },
          { src: ios("pool-23-live-activity-next-lock-screen"), at: 3.0, bar: null },
        ],
        { taps: [{ at: 1.25, x: 287, y: 726 }] },
      ),
    },
    {
      title: "The upsell",
      caption: "Spot a repair. Quote it on site.",
      phone: {
        ...iphone([
          { src: ios("pool-15-checklist-pump-noise"), at: 0 },
          { src: web("pool-customer-quote"), at: 2.8, web: true, bar: navyBar },
        ])!,
      },
    },
    {
      title: "Billing and the owner",
      caption: "Invoices out. Payments in.",
      desktop: {
        size: DESKTOP,
        scale: 2,
        url: "sundeckpro.com/invoices",
        frames: [
          { src: web("pool-invoices"), at: 0 },
          { src: web("pool-dashboard"), at: 2.9 },
        ],
        camera: [
          { at: 1.0, zoom: 1.3, x: 760, y: 420 },
          { at: 2.6, zoom: 1.3, x: 760, y: 470 },
          { at: 4.2, zoom: 1.35, x: 760, y: 330 },
        ],
      },
    },
  ],
};
