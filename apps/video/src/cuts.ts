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
const navyBar: StatusBar = { background: brand.navy, color: brand.paper };
const lightBar: StatusBar = { background: neutral[50], color: brand.navy };

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
    },
    {
      title: "The test",
      caption: "Every test, every finding, recorded",
    },
    {
      title: "Report and quote",
      caption: "A clear report. A quote on the spot.",
      phone: {
        size: PHONE,
        scale: 3,
        statusBar: lightBar,
        who: "Customer",
        frames: [
          {
            src: web("leak-customer-report"),
            at: 0,
            scroll: { from: 470, to: 1650, start: 0.6, end: 2.8 },
          },
          { src: web("leak-customer-quote"), at: 3.0, bar: navyBar },
        ],
      },
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
      phone: {
        size: PHONE,
        scale: 3,
        statusBar: lightBar,
        who: "Customer",
        frames: [
          {
            src: web("leak-customer-quote"),
            at: 0,
            scroll: { from: 0, to: 600, start: 0.5, end: 2.0 },
          },
        ],
      },
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
    { title: "The day", caption: "12 stops. One tap to the next." },
    { title: "The visit", caption: "Readings in. What to add, worked out." },
    { title: "The homeowner hears", caption: "Customers see the work, automatically" },
    {
      title: "The upsell",
      caption: "Spot a repair. Quote it on site.",
      phone: {
        size: PHONE,
        scale: 3,
        statusBar: navyBar,
        who: "Customer",
        frames: [
          {
            src: web("pool-customer-quote"),
            at: 0,
            scroll: { from: 0, to: 500, start: 1.2, end: 3.0 },
          },
        ],
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
