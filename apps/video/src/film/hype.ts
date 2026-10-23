// The 60-second hype cut (docs/plans/launch-video.md, section 10), shot by shot. Music first:
// fast cuts between the narration lines, holds only where a screen has to be read. Every cut is
// placed from the hype timeline (src/hype-timing.ts), so new voice takes re-time it.
//
// The look is the long film's (look.ts, kit.ts, devices.ts): navy, steel and concrete, Barlow
// Semi Condensed slammed in, the owner's photos with grain (grain on photos only, never over a
// screen), real app screens in an iPhone and a browser window. Device shots keep a caption column
// on the left and the device on the right, so a caption never sits over the app.
//
// Slots: a few shots need captures re-made for the leak story (Rebecca Quinn, 7745 N 42nd Ave,
// job #5163, the $1,535 quote with a $767.50 deposit). Until a slot is listed in READY (or
// passed with render-hype.ts --ready), it draws a labeled placeholder in the device instead.

import { clip, iphone, ownerStill, photoRef, stockRef, web, type Box } from "./assets.ts";
import { Browser, Phone, flick, pending, spring, type Clip } from "./devices.ts";
import {
  H,
  W,
  clamp,
  css,
  div,
  easeInOut,
  expoOut,
  img,
  keys,
  lerp,
  ramp,
  slam,
  type Scene,
  type Stage,
} from "./engine.ts";
import { surface, type PhotoRef, type Surface } from "./kit.ts";
import { textures } from "./look.ts";
import type { HypeTimeline } from "../hype-timing.ts";

export interface HypeManifest {
  timeline: HypeTimeline;
  web: Record<string, { width: number; height: number; boxes: Record<string, Box> }>;
  iphone: Record<string, { width: number; height: number }>;
  photos: Record<string, string | null>;
  stock: Record<string, string>;
  clips: Record<string, unknown>;
  ownerStills: Record<string, unknown>;
  /** Slots to draw from the current captures anyway (render-hype.ts --ready). */
  ready: string[];
}

/**
 * The shots waiting on re-made captures. Each draws its placeholder until it's listed here.
 * When the capture is re-made with the leak story's data, add its id and render again.
 */
const READY: string[] = ["report", "quote-open", "quote-accepted", "record-payment"];

const SLOTS: Record<string, { device: "phone" | "browser"; title: string; lines: string[] }> = {
  report: {
    device: "browser",
    title: "Report",
    lines: [
      "captures/web/report-desktop.png",
      "Rebecca Quinn · job #5163",
      "return line break, light niche conduit",
    ],
  },
  "quote-open": {
    device: "phone",
    title: "Quote",
    lines: [
      "captures/web/phone-quote-agreed.png",
      "$1,535.00 · deposit $767.50",
      "terms switched on, Accept Quote showing",
    ],
  },
  "quote-accepted": {
    device: "phone",
    title: "Quote accepted",
    lines: ["captures/web/phone-quote-accepted.png", "“Deposit of $767.50 received”"],
  },
  "record-payment": {
    device: "phone",
    title: "Record Payment",
    lines: [
      "captures/iphone/lv-record-payment.png",
      "Rebecca Quinn · invoice #2087 · 375.00",
      "Cash; and lv-findings for job #5163",
    ],
  },
};

let tl: HypeTimeline;
let manifestRef: HypeManifest;
let readySet = new Set<string>();
const isReady = (id: string) => readySet.has(id) || readySet.has("all");

/** Line n's start and end. */
const L = (n: number) => tl.lines.find((l) => l.n === n)!.start;
const E = (n: number) => tl.lines.find((l) => l.n === n)!.end;

type Draw = (t: number, d: number) => void;

function scene(start: number, end: number, z: number, build: (el: HTMLElement) => Draw): Scene {
  return { start, end, z, build };
}

// ---------------------------------------------------------------------------
// Layout: the caption column on the left, devices on the right
// ---------------------------------------------------------------------------

/** The caption column (title-safe on the left). */
const COL = { x: 110, w: 740 };
/** Where the phone sits on device shots, and where a browser's left edge sits. */
const PHONE_X = 1390;
const DESK_X = 900;

// ---------------------------------------------------------------------------
// Photos: a constant-speed push (no easing, so a fast cut never lands on a stopped frame),
// optional whip-in, and grain over the photo only.
// ---------------------------------------------------------------------------

function photo(
  parent: HTMLElement,
  ref: PhotoRef,
  from: [number, number, number],
  to: [number, number, number],
  opts: { shade?: number; whip?: number; whipDir?: 1 | -1 } = {},
) {
  const wrap = div("fill", parent);
  css(wrap, { overflow: "hidden", background: "var(--n900)" });
  const el = img(ref.url ?? "", wrap, "fill");
  pending.push(el.decode().catch(() => {}));
  css(el, { width: W, height: H, "object-fit": "cover", filter: "contrast(1.06) saturate(0.92)" });
  const dark = div("fill", wrap);
  css(dark, { background: "var(--navy)", opacity: opts.shade ?? 0 });
  const grain = div("grain", wrap);
  css(grain, { opacity: 0.07 });
  return (t: number, d: number) => {
    const p = clamp(t / Math.max(d, 0.01));
    const s = lerp(from[0], to[0], p);
    const x = lerp(from[1], to[1], p);
    const y = lerp(from[2], to[2], p);
    // A whip: the photo arrives sliding fast and blurred, settling in a few frames.
    const w = opts.whip ? 1 - expoOut(ramp(t, 0, opts.whip)) : 0;
    const dx = w * 260 * (opts.whipDir ?? 1);
    el.style.transformOrigin = `${x}% ${y}%`;
    el.style.transform = `translateX(${dx}px) scale(${s})`;
    el.style.filter = `contrast(1.06) saturate(0.92)${w > 0.02 ? ` blur(${(w * 10).toFixed(1)}px)` : ""}`;
    grain.style.backgroundImage = `url(${textures.grain[Math.floor(t * 15) % textures.grain.length]})`;
  };
}

function photoShot(
  start: number,
  end: number,
  ref: PhotoRef,
  from: [number, number, number],
  to: [number, number, number],
  opts: { shade?: number; whip?: number; whipDir?: 1 | -1 } = {},
): Scene {
  return scene(start, end, 10, (el) => photo(el, ref, from, to, opts));
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

/** A layer the camera moves; `set` puts rig point (px, py) at frame point (fx, fy) at zoom s. */
function rigLayer(parent: HTMLElement) {
  const el = div("abs", parent);
  css(el, { width: W, height: H });
  return {
    el,
    set(s: number, px: number, py: number, fx: number, fy: number) {
      el.style.transform = `translate(${fx - px * s}px, ${fy - py * s}px) scale(${s})`;
    },
  };
}

interface CamKey {
  s: number;
  /** The rig point to frame. */
  x: number;
  y: number;
  /** Where in the frame (default: the phone's spot on the right). */
  fx?: number;
  fy?: number;
}

/** Keyframed camera with a slow float, so a device is never dead still. */
function camera(
  r: ReturnType<typeof rigLayer>,
  t: number,
  frames: [number, CamKey][],
  ease = easeInOut,
  float = 4,
) {
  const k = (f: (c: CamKey) => number) =>
    keys(
      t,
      frames.map(([a, c]) => [a, f(c)]),
      ease,
    );
  const s = k((c) => c.s);
  const fx = k((c) => c.fx ?? c.x);
  const fy = k((c) => c.fy ?? c.y);
  r.set(
    s,
    k((c) => c.x),
    k((c) => c.y),
    fx + Math.sin(t * 0.9) * float,
    fy + Math.cos(t * 0.7) * float * 0.8,
  );
}

interface PhoneRig {
  phone: Phone;
  x: number;
  y: number;
  /** A point on the screen (screen pixels from its top left) in rig pixels. */
  at: (sx: number, sy: number) => { x: number; y: number };
}

function placePhone(
  parent: HTMLElement,
  cx: number,
  cy: number,
  width = 420,
  opts: ConstructorParameters<typeof Phone>[2] = {},
): PhoneRig {
  const phone = new Phone(parent, width, opts);
  const x = cx - phone.outerW / 2;
  const y = cy - phone.outerH / 2;
  css(phone.el, { transform: `translate(${x}px, ${y}px)` });
  return {
    phone,
    x,
    y,
    at: (sx, sy) => ({ x: x + phone.bezel + sx, y: y + phone.bezel + sy }),
  };
}

/** A device shot: a surface, a camera rig, and what goes in it. */
function deviceShot(
  start: number,
  end: number,
  kind: Surface,
  make: (r: ReturnType<typeof rigLayer>, el: HTMLElement) => Draw,
): Scene {
  return scene(start, end, 10, (el) => {
    const bg = surface(el, kind);
    const r = rigLayer(el);
    const draw = make(r, el);
    return (t, d) => {
      bg(t + start);
      draw(t, d);
    };
  });
}

/** Where a recording sits on the phone's screen (cut below the status bar: at the bottom). */
function clipTop(phone: Phone, c: Clip) {
  return Math.max(0, phone.h - (c.height * phone.w) / c.width);
}

/** Plays clip segments back to back: the clip time for shot time `t` at a speed. */
function segmentTime(t: number, segs: [number, number][], speed = 1): number {
  let left = Math.max(0, t) * speed;
  for (const [a, b] of segs) {
    if (left <= b - a) return a + left;
    left -= b - a;
  }
  return segs[segs.length - 1]![1];
}

/**
 * A browser window whose left edge sits right of the caption column and whose page runs off the
 * right of the frame: a push-in at a readable size. `set(s, py)` puts capture row `py` at the
 * frame's middle at zoom `s` (1 = the page at its own size).
 */
function desk(parent: HTMLElement, name: string, address = "sundeckpro.com") {
  const cap = web(name);
  const b = new Browser(parent, 1440, address);
  const layer = b.layer(cap.src);
  css(b.el, { "transform-origin": "0 0" });
  return {
    b,
    cap,
    layer,
    /**
     * Zoom `s`, capture row `py` toward the frame's middle: the page scrolls to it (as far as it
     * scrolls), then the window moves, keeping its top edge at or above the frame's top margin
     * and its bottom edge at or below the frame's bottom margin. `x` is the window's left edge
     * (default: right of the caption column).
     */
    set(t: number, s: number, py: number, x = DESK_X) {
      const view = b.h / b.k;
      const scroll = clamp(py - view / 2, 0, Math.max(0, cap.height - view));
      layer.set(scroll);
      const yIn = b.bar + (py - scroll) * b.k;
      const hi = 64;
      const lo = H - 64 - s * (b.bar + b.h);
      const want = H / 2 - s * yIn;
      const ty = (lo > hi ? hi : clamp(want, lo, hi)) + Math.cos(t * 0.7) * 3;
      b.el.style.transform = `translate(${x + Math.sin(t * 0.9) * 3}px, ${ty}px) scale(${s})`;
    },
  };
}

/** Where the push-in panel starts: right of the caption column, to the frame's right edge. */
const PANEL_X = 860;

/**
 * A deliberate push-in on one region of a website screen: the right of the frame is a panel
 * filled edge to edge by the page at zoom `s`, with a water-blue rule where it meets the caption
 * column. `set(t, s, left, top)` puts the page's CSS point (left, top) at the panel's top left;
 * each shot picks `left` and `s` so the panel's edges fall in the page's own gutters (between
 * cards), never through a word. The page scrolls when `top` is below its first screen, and the
 * shot drifts down a few pixels so it's never dead still.
 */
function panel(parent: HTMLElement, name: string) {
  const cap = web(name);
  const clipBox = div("abs", parent);
  css(clipBox, { left: PANEL_X, top: 0, width: W - PANEL_X, height: H, overflow: "hidden" });
  const b = new Browser(clipBox, 1440);
  const layer = b.layer(cap.src);
  css(b.el, { "transform-origin": "0 0", "box-shadow": "none", "border-radius": 0 });
  const rule = div("abs", parent);
  css(rule, { left: PANEL_X - 6, top: 0, width: 6, height: H, background: "var(--water)" });
  /** CSS pixels per capture pixel (2× captures). */
  const c = b.k * 2;
  return {
    cap,
    set(t: number, s: number, left: number, top: number) {
      const maxScroll = Math.max(0, cap.height * b.k - b.h);
      const scroll = clamp(top, 0, maxScroll);
      layer.set(scroll / b.k);
      const drift = t * 6;
      const bx = -left * c * s;
      // Never below the panel's top edge, and never short of its bottom edge.
      const by = clamp(-(b.bar + top - scroll) * s + drift, H - s * (b.bar + b.h), 0);
      b.el.style.transform = `translate(${bx}px, ${by}px) scale(${s})`;
    },
  };
}

/**
 * The whole browser window, with margins, in the frame right of the caption column: the overview
 * ("Your whole shop.", "You see all of it."), pushing in slowly about its center.
 */
function whole(parent: HTMLElement, name: string) {
  const cap = web(name);
  const b = new Browser(parent, 1440);
  b.layer(cap.src).set(0);
  css(b.el, { "transform-origin": "50% 50%" });
  const cx = (PANEL_X + W) / 2;
  return (t: number, s: number) => {
    const x = cx - b.outerW / 2 + Math.sin(t * 0.9) * 3;
    const y = H / 2 - b.outerH / 2 + Math.cos(t * 0.7) * 3;
    b.el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  };
}

/** The owner's week board: the dispatch capture (next week, before the moves), else the week. */
function weekBoard() {
  return manifestRef.web["dispatch-0"] ? "dispatch-0" : "week";
}

/** A labeled placeholder where a re-made capture goes (see SLOTS). */
function slotCard(parent: HTMLElement, id: string, scale = 1) {
  const s = SLOTS[id]!;
  const el = div("fill", parent);
  css(el, {
    background: "var(--n800)",
    display: "flex",
    "flex-direction": "column",
    "justify-content": "center",
    padding: `0 ${34 * scale}px`,
    gap: `${14 * scale}px`,
  });
  const box = div("", el);
  css(box, {
    border: `${3 * scale}px dashed var(--n400)`,
    "border-radius": 18 * scale,
    padding: `${36 * scale}px ${28 * scale}px`,
    display: "flex",
    "flex-direction": "column",
    gap: `${12 * scale}px`,
  });
  const k = div("display", box, "Re-capture");
  css(k, { "font-size": 30 * scale, color: "var(--n300)" });
  const t = div("display", box, s.title);
  css(t, { "font-size": 64 * scale, color: "var(--paper)" });
  for (const line of s.lines) {
    const l = div("", box, line);
    css(l, {
      font: `500 ${19 * scale}px/1.35 'Public Sans', sans-serif`,
      color: "var(--n200)",
      "overflow-wrap": "anywhere",
    });
  }
  return el;
}

// ---------------------------------------------------------------------------
// Captions: the narration's own words, slammed in, left-aligned, white
// ---------------------------------------------------------------------------

interface CapItem {
  lines: string[];
  at: number;
}

interface CapGroup {
  items: CapItem[];
  until: number;
  /** "column": left column, centered on the frame; "photo": low left; "center": a big line. */
  place: "column" | "photo" | "center" | "end";
  size: number;
  /** A shake at this time (the hit). */
  shake?: number;
  /** Hide (without ending the group) during these spans. */
}

let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(text: string, size: number) {
  measureCtx ??= document.createElement("canvas").getContext("2d")!;
  measureCtx.font = `800 ${size}px 'Barlow Semi Condensed'`;
  return measureCtx.measureText(text.toUpperCase()).width * 1.005;
}

function captionScene(g: CapGroup): Scene {
  const start = g.items[0]!.at;
  return scene(start, g.until, 60, (el) => {
    const maxW = g.place === "column" ? COL.w : W - 2 * COL.x;
    let size = g.size;
    for (const it of g.items)
      for (const line of it.lines) size = Math.min(size, (g.size * maxW) / textWidth(line, g.size));
    size = Math.floor(size);
    const lh = size * 0.94;
    const gap = size * 0.22;
    const total =
      g.items.reduce((h, it) => h + it.lines.length * lh, 0) + gap * (g.items.length - 1);
    const top =
      g.place === "column" || g.place === "center"
        ? H / 2 - total / 2
        : g.place === "end"
          ? 590
          : H - 118 - total;
    const box = div("display", el);
    css(box, {
      position: "absolute",
      left: COL.x,
      top,
      "font-size": size,
      "line-height": `${lh}px`,
      color: "var(--paper)",
      "text-shadow": "0 5px 0 rgba(0, 0, 0, 0.32)",
      "white-space": "nowrap",
    });
    const words: { el: HTMLElement; at: number }[] = [];
    g.items.forEach((it, i) => {
      const block = div("", box);
      if (i) css(block, { "margin-top": gap });
      let k = 0;
      for (const line of it.lines) {
        const row = div("", block);
        line.split(" ").forEach((w, j) => {
          const span = document.createElement("span");
          span.className = "word";
          span.textContent = (j ? " " : "") + w;
          row.appendChild(span);
          words.push({ el: span, at: it.at - start + k * 0.075 });
          k++;
        });
      }
    });
    return (t) => {
      for (const w of words) {
        const p = ramp(t, w.at, w.at + 0.17);
        // Full white within two frames; the slam is in the scale.
        w.el.style.opacity = String(ramp(t, w.at, w.at + 0.034));
        w.el.style.transform = `scale(${lerp(1.4, 1, slam(p))})`;
      }
      if (g.shake !== undefined) {
        const ts = t + start - g.shake;
        const p = ramp(ts, 0, 0.4);
        const k = p > 0 && p < 1 ? (1 - p) * 22 : 0;
        const bump = ts >= 0 && ts < 0.12 ? 1.06 - ts * 0.5 : 1;
        box.style.transform = `translate(${Math.sin(ts * 90) * k}px, ${Math.cos(ts * 77) * k * 0.7}px) scale(${bump})`;
        box.style.transformOrigin = "0 50%";
      }
    };
  });
}

/** A big clock stamp over the photo ("10:04 PM"). */
function stamp(parent: HTMLElement, text: string) {
  const el = div("display", parent, text);
  css(el, {
    position: "absolute",
    left: COL.x,
    top: 92,
    "font-size": 168,
    color: "var(--paper)",
    "text-shadow": "0 6px 0 rgba(0,0,0,0.35)",
  });
  return (t: number) => {
    const p = ramp(t, 0, 0.2);
    el.style.opacity = String(clamp(p * 3));
    el.style.transform = `scale(${lerp(1.3, 1, slam(p))})`;
    el.style.transformOrigin = "0 50%";
  };
}

// ---------------------------------------------------------------------------
// The cut
// ---------------------------------------------------------------------------

export function buildHype(stage: Stage, manifest: HypeManifest) {
  tl = manifest.timeline;
  manifestRef = manifest;
  readySet = new Set([...READY, ...manifest.ready]);
  const add = (s: Scene) => stage.add(s);
  const hit = tl.hit;
  const caps: CapGroup[] = [];

  // Cold open -----------------------------------------------------------------------------
  // "And at ten at night… you're at the kitchen table, doing the invoices." Whip cuts: the
  // phone buzzing in the truck, the kitchen table at ten, a punch-in on the paperwork, the
  // whiteboard, then the table again, darker, under "The paperwork is running you."
  const a1 = L(3) + 1.1;
  const a2 = L(3) + 2.85;
  const a3 = L(5);
  const a4 = L(5) + 1.45;
  const a5 = L(6) - 0.25;
  add(photoShot(0, a1, photoRef("04"), [1.06, 45, 50], [1.16, 40, 55], { shade: 0.15 }));
  add(
    scene(a1, a3, 10, (el) => {
      const wide = div("fill", el);
      const p1 = photo(wide, photoRef("03"), [1.02, 50, 50], [1.08, 52, 48], {
        shade: 0.12,
        whip: 0.14,
      });
      const tight = div("fill", el);
      // The punch-in: the calculator and the stack of invoices.
      const p2 = photo(tight, photoRef("03"), [1.65, 58, 62], [1.78, 60, 64], { shade: 0.12 });
      const s = stamp(el, "10:04 PM");
      return (t) => {
        const cut = a2 - a1;
        wide.style.display = t < cut ? "" : "none";
        tight.style.display = t < cut ? "none" : "";
        p1(t, cut);
        p2(t - cut, a3 - a2);
        s(t - 0.1);
      };
    }),
  );
  add(
    photoShot(a3, a4, photoRef("02"), [1.12, 40, 50], [1.22, 62, 50], {
      shade: 0.12,
      whip: 0.16,
      whipDir: -1,
    }),
  );
  add(photoShot(a4, a5, photoRef("03"), [1.12, 50, 52], [1.22, 48, 46], { shade: 0.42 }));
  caps.push({
    place: "photo",
    size: 150,
    until: a5,
    items: [
      { lines: ["The paperwork"], at: L(5) + 1.56 },
      { lines: ["is running you."], at: L(5) + 2.35 },
    ],
  });
  // The beat of silence: black, then "Not anymore." (it stays through the hit, on navy).
  add(
    scene(a5, hit, 10, (el) => {
      css(div("fill", el), { background: "#000" });
      return () => {};
    }),
  );
  caps.push({
    place: "center",
    size: 250,
    until: L(7),
    shake: hit,
    items: [{ lines: ["Not anymore."], at: L(6) + 0.07 }],
  });

  // The turn: the hit, the logo, "Your whole shop. In your pocket. On every truck." -----
  const b2 = L(7) + 1.38;
  const b3 = L(7) + 2.76;
  const b4 = L(7) + 3.87;
  const c1 = L(7) + 5.45;
  const c2 = L(12) - 2.0;
  add(
    scene(hit, b2, 10, (el) => {
      const bg = surface(el, "navy", false);
      const logo = img("/brand/logo/sundeck-logo-reverse.svg", el, "abs");
      css(logo, { width: 1040, left: W / 2 - 520, top: H / 2 - 175 });
      const flash = div("fill", el);
      css(flash, { background: "var(--paper)" });
      const logoAt = L(7) - hit;
      return (t) => {
        bg(t);
        // A white frame on the hit, gone in a tenth of a second.
        flash.style.opacity = String(0.55 * (1 - ramp(t, 0, 0.1)));
        const p = ramp(t, logoAt, logoAt + 0.28);
        logo.style.opacity = String(clamp(p * 4));
        logo.style.transform = `scale(${lerp(1.5, 1, slam(p))})`;
        const k = ramp(t, logoAt + 0.05, logoAt + 0.4);
        const amt = k > 0 && k < 1 ? (1 - k) * 12 : 0;
        logo.style.translate = `${Math.sin(t * 90) * amt}px ${Math.cos(t * 77) * amt * 0.7}px`;
      };
    }),
  );
  add(
    scene(b2, b3, 10, (el) => {
      const bg = surface(el, "steel");
      const d = whole(el, weekBoard());
      return (t) => {
        bg(t + b2);
        // The whole week board: every tech, every day.
        d(t, 0.66 + t * 0.012);
      };
    }),
  );
  const rec02 = clip("02");
  add(
    deviceShot(b3, b4, "concrete", (r) => {
      const p = placePhone(r.el, PHONE_X, H / 2, 420, { time: "6:34" });
      const l = rec02 ? p.phone.clip(rec02) : null;
      return (t) => {
        l?.set(0.55 + t * 1.15);
        camera(r, t, [
          [0, { s: 1.0, x: PHONE_X, y: H / 2 }],
          [1.2, { s: 1.04, x: PHONE_X, y: H / 2 - 20 }],
        ]);
      };
    }),
  );
  add(photoShot(b4, c1, photoRef("01"), [1.04, 55, 50], [1.12, 60, 48], { shade: 0.3 }));
  caps.push({
    place: "column",
    size: 128,
    until: c2,
    items: [
      { lines: ["Your whole shop."], at: L(7) + 1.44 },
      { lines: ["In your pocket."], at: L(7) + 2.82 },
      { lines: ["On every truck."], at: L(7) + 3.93 },
    ],
  });

  // Dispatch and the road ------------------------------------------------------------------
  // The owner's recording: a job dragged into Luis's route, then Optimize ("Optimized · 39 min
  // less driving"), framed on the banner and the map (never the stop times further down).
  const c3 = L(12) - 0.45;
  const c4 = L(12) + 2.6;
  const d1 = L(12) + 4.5;
  const rec03 = clip("03");
  add(
    deviceShot(c1, c2, "steel", (r) => {
      const p = placePhone(r.el, PHONE_X, H / 2, 420, { time: "6:12" });
      const l = rec03 ? p.phone.clip(rec03) : null;
      const top = rec03 ? clipTop(p.phone, rec03) : 0;
      const ch = p.phone.h - top;
      // The drag: Jason Castillo's card lifted out of Needs a Time into the route.
      const focus = p.at(p.phone.w * 0.5, top + ch * 0.42);
      return (t) => {
        l?.set(4.7 + t * 1.55);
        camera(r, t, [
          [0, { s: 1.0, x: PHONE_X, y: H / 2 }],
          [1.1, { s: 1.32, x: focus.x, y: focus.y, fx: PHONE_X, fy: H / 2 }],
        ]);
      };
    }),
  );
  add(
    deviceShot(c2, c3, "steel", (r) => {
      const p = placePhone(r.el, PHONE_X, H / 2, 420, { time: "6:12" });
      const l = rec03 ? p.phone.clip(rec03) : null;
      const top = rec03 ? clipTop(p.phone, rec03) : 0;
      const ch = p.phone.h - top;
      const banner = p.at(p.phone.w * 0.5, top + ch * 0.3);
      return (t) => {
        // From just before Optimize lands to the end of the recording, held there.
        l?.set(12.15 + t);
        camera(r, t, [
          [0, { s: 1.5, x: banner.x, y: banner.y + 20, fx: PHONE_X, fy: H / 2 }],
          [1.6, { s: 1.6, x: banner.x, y: banner.y, fx: PHONE_X, fy: H / 2 }],
        ]);
      };
    }),
  );
  caps.push({
    place: "column",
    size: 150,
    until: c3 + 0.42,
    items: [{ lines: ["39 min", "less driving."], at: c2 + 0.5 }],
  });
  const rec01 = clip("01");
  add(
    deviceShot(c3, c4, "concrete", (r) => {
      const p = placePhone(r.el, PHONE_X, H / 2, 420, { time: "6:30" });
      const l = rec01 ? p.phone.clip(rec01) : null;
      const top = rec01 ? clipTop(p.phone, rec01) : 0;
      const ch = p.phone.h - top;
      // Today, the tap on the card's text button, then the card reading "On the way" (the
      // Messages step in between is left out).
      const segs: [number, number][] = [
        [1.0, 1.95],
        [5.5, rec01 ? rec01.duration - 0.05 : 7],
      ];
      const bubble = { x: p.phone.w * 0.63, y: top + ch * 0.483 };
      const card = p.at(p.phone.w * 0.5, top + ch * 0.25);
      return (t) => {
        l?.set(segmentTime(t, segs));
        p.phone.tapAt(0, bubble.x, bubble.y, t, { w: p.phone.w * 0.085, h: p.phone.w * 0.085 });
        camera(r, t, [
          [0, { s: 1.0, x: PHONE_X, y: H / 2 }],
          [1.0, { s: 1.0, x: PHONE_X, y: H / 2 }],
          [2.4, { s: 1.22, x: card.x, y: card.y, fx: PHONE_X, fy: H / 2 - 40 }],
        ]);
      };
    }),
  );
  add(
    deviceShot(c4, d1, "steel", (r) => {
      // The Lock Screen: the Live Activity, "On the way to Rebecca Quinn".
      const lock = ownerStill("01") as { url: string; width: number; height: number } | null;
      const p = placePhone(r.el, PHONE_X, H / 2, 420, { status: "light", time: "6:31" });
      css(p.phone.screen, { background: "var(--navy)" });
      if (!lock) return () => {};
      const l = p.phone.layer(lock.url, lock.width);
      const top = Math.max(0, p.phone.h - (lock.height * p.phone.w) / lock.width);
      css(l.el, { top });
      const act = p.at(p.phone.w * 0.5, top + ((lock.height * p.phone.w) / lock.width) * 0.75);
      return (t) => {
        l.set(0);
        camera(r, t, [
          [0, { s: 1.0, x: PHONE_X, y: H / 2 }],
          [0.9, { s: 1.55, x: act.x, y: act.y, fx: PHONE_X - 40, fy: H / 2 }],
          [1.9, { s: 1.6, x: act.x, y: act.y, fx: PHONE_X - 40, fy: H / 2 }],
        ]);
      };
    }),
  );
  caps.push({
    place: "column",
    size: 150,
    until: d1,
    items: [
      { lines: ["One tap."], at: L(12) + 0.06 },
      { lines: ["We’re on", "the way."], at: L(12) + 2.71 },
    ],
  });

  // Find it, prove it, close it ------------------------------------------------------------
  const d2 = L(21) - 1.8;
  const d3 = L(21) - 0.9;
  const d4 = L(21) - 0.05;
  const d5 = L(21) + 2.22;
  const d6 = L(21) + 3.76;
  const e1 = E(21) + 0.35;
  // Dye at the light niche.
  add(
    photoShot(L(12) + 4.5, d2, stockRef("leak-dye-light-niche"), [1.1, 40, 50], [1.22, 50, 50], {
      whip: 0.12,
    }),
  );
  // The owner's recording: the leak marked on the pool diagram (arrow), framed on the diagram.
  const rec05 = clip("05");
  add(
    deviceShot(d2, d3, "concrete", (r) => {
      // No caption here: the phone takes the middle of the frame.
      const p = placePhone(r.el, W / 2, H / 2, 420, { status: "none", island: false });
      const l = rec05 ? p.phone.clip(rec05) : null;
      const diagram = p.at(p.phone.w * 0.5, p.phone.h * 0.47);
      return (t) => {
        l?.set(11.8 + t);
        // In its phone: the bezel stays on both sides while it pushes in on the diagram.
        camera(r, t, [
          [0, { s: 1.08, x: diagram.x, y: diagram.y, fx: W / 2, fy: H / 2 }],
          [1.0, { s: 1.22, x: diagram.x, y: diagram.y, fx: W / 2, fy: H / 2 }],
        ]);
      };
    }),
  );
  // The report: what we found.
  add(
    scene(d3, d4, 10, (el) => {
      const bg = surface(el, "steel");
      if (!isReady("report")) {
        const b = new Browser(el, 1440, "sundeckpro.com/r/…");
        slotCard(b.page, "report", 1.6);
        css(b.el, { "transform-origin": "0 0" });
        return (t) => {
          bg(t + d3);
          const s = lerp(0.9, 0.94, t);
          b.el.style.transform = `translate(${(W - 1440 * s) / 2}px, 90px) scale(${s})`;
        };
      }
      const d = desk(el, "report-desktop", "sundeckpro.com/r/…");
      return (t, dur) => {
        bg(t + d3);
        // Summary and What we found, scrolled so the diagram stays just below the window.
        const s = lerp(1.24, 1.3, t / dur);
        d.set(t, s, 980, W / 2 - 720 * s);
      };
    }),
  );
  // The customer's own phone: Accept Quote, then the deposit received.
  add(
    deviceShot(d4, d5, "concrete", (r) => {
      const p = placePhone(r.el, PHONE_X, H / 2, 420, { time: "10:04" });
      if (!isReady("quote-open")) {
        slotCard(p.phone.screen, "quote-open", 0.62);
        return (t) => camera(r, t, [[0, { s: 1.0, x: PHONE_X, y: H / 2 }]]);
      }
      const name = manifest.web["phone-quote-agreed"] ? "phone-quote-agreed" : "phone-quote-open";
      const q = web(name);
      const l = p.phone.layer(q.src);
      css(l.el, { top: 54 * (p.phone.w / 393) });
      const acc = q.boxes.accept ?? { x: 50, y: 2900, w: 1080, h: 130 };
      const screenH = p.phone.h / p.phone.k;
      const end = Math.min(q.height - screenH + 200, acc.y - screenH * 0.72);
      return (t) => {
        const scroll = flick(t, 0, end - 700, end, 0.75);
        l.set(scroll);
        const k = p.phone.k;
        p.phone.tapAt(
          0,
          (acc.x + acc.w / 2) * k,
          54 * (p.phone.w / 393) + (acc.y + acc.h / 2 - scroll) * k,
          t - 0.35,
          { w: acc.w * k, h: acc.h * k },
        );
        camera(r, t, [
          [0, { s: 1.0, x: PHONE_X, y: H / 2 }],
          [2.2, { s: 1.06, x: PHONE_X, y: H / 2 + 60 }],
        ]);
      };
    }),
  );
  add(
    deviceShot(d5, d6, "concrete", (r) => {
      const p = placePhone(r.el, PHONE_X, H / 2, 420, { time: "10:05" });
      if (!isReady("quote-accepted")) {
        slotCard(p.phone.screen, "quote-accepted", 0.62);
        return (t) => camera(r, t, [[0, { s: 1.0, x: PHONE_X, y: H / 2 }]]);
      }
      const q = web("phone-quote-accepted");
      const l = p.phone.layer(q.src);
      css(l.el, { top: 54 * (p.phone.w / 393) });
      const dep = q.boxes.deposit ?? { x: 50, y: 2700, w: 1080, h: 140 };
      const screenH = p.phone.h / p.phone.k;
      const end = Math.max(0, Math.min(q.height - screenH + 160, dep.y - screenH * 0.55));
      const focus = p.at(p.phone.w / 2, 54 * (p.phone.w / 393) + (dep.y - end) * p.phone.k);
      return (t) => {
        l.set(flick(t, 0, end - 160, end, 0.6));
        camera(r, t, [
          [0, { s: 1.0, x: PHONE_X, y: H / 2 }],
          [0.5, { s: 1.0, x: PHONE_X, y: H / 2 }],
          [1.4, { s: 1.35, x: focus.x, y: focus.y, fx: PHONE_X, fy: H / 2 }],
        ]);
      };
    }),
  );
  // "…and you've got the job."
  add(photoShot(d6, e1, photoRef("07"), [1.04, 50, 50], [1.1, 46, 48], { shade: 0.3 }));
  caps.push(
    {
      place: "column",
      size: 120,
      until: d5,
      items: [{ lines: ["They tap accept", "on their own phone."], at: L(21) + 0.05 }],
    },
    {
      place: "column",
      size: 128,
      until: d6,
      items: [{ lines: ["Put the", "deposit down…"], at: L(21) + 2.27 }],
    },
    {
      place: "column",
      size: 128,
      until: e1,
      items: [{ lines: ["And you’ve", "got the job."], at: L(21) + 3.81 }],
    },
  );

  // Get paid ----------------------------------------------------------------------------------
  // On the tech's phone: Record Payment ($375.00, cash, invoice #2087), the tap on Record
  // Payment, then Send Receipt springs up over it (the first sheet steps back, as iOS stacks
  // sheets) and the tap on Send Receipt. No caption: the phone takes the middle of the frame.
  const e3 = L(30);
  const f1 = L(31) - 0.05;
  add(
    deviceShot(e1, e3, "concrete", (r) => {
      const p = placePhone(r.el, W / 2, H / 2, 420, { time: "10:12" });
      const dim = div("fill", p.phone.screen);
      css(dim, { background: "#000", opacity: 0.22 });
      p.phone.screen.insertBefore(dim, p.phone.status);
      if (!isReady("record-payment")) {
        slotCard(p.phone.screen, "record-payment", 0.62);
        return (t) => camera(r, t, [[0, { s: 1.0, x: W / 2, y: H / 2 }]]);
      }
      const pay = p.phone.sheet(iphone("lv-record-payment")!.src);
      const rs = iphone("lv-send-receipt");
      const receipt = rs ? p.phone.sheet(rs.src) : null;
      css(pay.wrap, { "transform-origin": "50% 0" });
      const record = pay.at(590, 1200);
      const send = receipt?.at(590, 1204) ?? record;
      const tRecord = 0.3;
      const tSheet = 0.95;
      const tSend = 1.45;
      const focus = p.at(p.phone.w / 2, (record.y + send.y) / 2 - 140);
      return (t) => {
        const sp = spring(t - tSheet, 0.42);
        pay.set(1);
        // Stepped back under the new sheet: a little smaller, a little darker.
        pay.wrap.style.transform += ` scale(${1 - 0.06 * sp})`;
        pay.wrap.style.filter = sp > 0 ? `brightness(${1 - 0.25 * sp})` : "";
        receipt?.set(sp);
        p.phone.tapAt(0, record.x, record.y, t - tRecord, { w: 1080 * pay.k, h: 110 * pay.k });
        if (receipt)
          p.phone.tapAt(1, send.x, send.y, t - tSend, { w: 1080 * receipt.k, h: 110 * receipt.k });
        camera(r, t, [
          [0, { s: 1.12, x: focus.x, y: focus.y, fx: W / 2, fy: H / 2 }],
          [2.2, { s: 1.2, x: focus.x, y: focus.y, fx: W / 2, fy: H / 2 }],
        ]);
      };
    }),
  );
  // "Stop chasing money. Watch it come in.": the Dashboard's Collected, pushing in.
  add(
    scene(e3, f1, 10, (el) => {
      const bg = surface(el, "steel");
      const d = panel(el, "vs-dashboard");
      const col = d.cap.boxes.collected ?? { x: 1066, y: 390, w: 746, h: 45 };
      return (t) => {
        bg(t + e3);
        // Collected, big.
        d.set(t, 2.55, col.x / 2 - 17, 150);
      };
    }),
  );
  caps.push({
    place: "column",
    size: 128,
    until: f1,
    items: [
      { lines: ["Stop chasing", "money."], at: L(30) + 0.06 },
      { lines: ["Watch it", "come in."], at: L(30) + 1.81 },
    ],
  });

  // The command center: "And you? You see all of it. Every truck. Every job. Every dollar." --
  const f2 = L(31) + 2.45;
  const f3 = L(31) + 3.45;
  const f4 = L(31) + 4.65;
  const g1 = L(39);
  add(
    scene(f1, f2, 10, (el) => {
      const bg = surface(el, "steel");
      const d = whole(el, "vs-dashboard");
      return (t) => {
        bg(t + f1);
        // The whole Dashboard.
        d(t, 0.66 + t * 0.008);
      };
    }),
  );
  add(
    scene(f2, f3, 10, (el) => {
      const bg = surface(el, "steel");
      const d = panel(el, weekBoard());
      // Every tech: their chips and their day maps on the week.
      return (t) => {
        bg(t + f2);
        d.set(t, 1.2, 318, 185);
      };
    }),
  );
  add(
    scene(f3, f4, 10, (el) => {
      const bg = surface(el, "steel");
      const d = panel(el, weekBoard());
      // Every job: each tech's stops, day by day.
      return (t) => {
        bg(t + f3);
        // Dana's and Jake's rows: their stops, day by day.
        d.set(t, 1.667, 194, 532);
      };
    }),
  );
  add(
    scene(f4, g1, 10, (el) => {
      const bg = surface(el, "steel");
      const d = panel(el, "vs-dashboard");
      // Collected and invoiced, six months of it.
      return (t) => {
        bg(t + f4);
        // Collected and the bars, month by month.
        d.set(t, 1.65, 80, 455);
      };
    }),
  );
  caps.push(
    {
      place: "column",
      size: 140,
      until: f2,
      items: [
        { lines: ["And you?"], at: L(31) + 0.08 },
        { lines: ["You see", "all of it."], at: L(31) + 1.04 },
      ],
    },
    {
      place: "column",
      size: 140,
      until: g1,
      items: [
        { lines: ["Every truck."], at: L(31) + 2.51 },
        { lines: ["Every job."], at: L(31) + 3.51 },
        { lines: ["Every dollar."], at: L(31) + 4.73 },
      ],
    },
  );

  // The vision ----------------------------------------------------------------------------------
  const g2 = L(39) + 1.22;
  const g3 = L(39) + 2.42;
  const g4 = L(40);
  const g5 = L(40) + 1.35;
  const end = tl.endHit;
  add(photoShot(g1, g2, photoRef("08"), [1.45, 78, 62], [1.55, 80, 62], { shade: 0.18 }));
  add(photoShot(g2, g3, photoRef("09"), [1.06, 50, 45], [1.14, 52, 45], { shade: 0.2 }));
  add(photoShot(g3, g4, photoRef("08"), [1.16, 60, 55], [1.02, 50, 50], { shade: 0.2 }));
  add(photoShot(g4, g5, photoRef("10"), [1.04, 50, 50], [1.12, 46, 50], { shade: 0.2 }));
  // The lake runs on under the end hit: darker, the logo slams in, then the line. At "Start
  // your free trial" it cuts to the end card.
  const card = L(43) - 0.25;
  add(
    scene(g5, card, 10, (el) => {
      const ph = photo(el, photoRef("11"), [1.04, 55, 50], [1.2, 62, 47]);
      const dark = div("fill", el);
      css(dark, { background: "var(--navy)" });
      const logo = img("/brand/logo/sundeck-logo-reverse.svg", el, "abs");
      css(logo, { width: 860, left: COL.x - 6, top: 300, "transform-origin": "0 50%" });
      const hitAt = end - g5;
      return (t, d) => {
        ph(t, d);
        dark.style.opacity = String(0.2 + 0.4 * expoOut(ramp(t, hitAt, hitAt + 0.5)));
        const p = ramp(t, hitAt, hitAt + 0.26);
        logo.style.opacity = String(ramp(t, hitAt, hitAt + 0.04));
        logo.style.transform = `scale(${lerp(1.4, 1, slam(p))})`;
      };
    }),
  );
  caps.push(
    {
      place: "photo",
      size: 128,
      until: g4,
      items: [
        { lines: ["Another truck."], at: L(39) + 0.08 },
        { lines: ["Another crew."], at: L(39) + 1.29 },
        { lines: ["A bigger name in town."], at: L(39) + 2.49 },
      ],
    },
    {
      place: "photo",
      size: 128,
      until: end,
      items: [
        { lines: ["Home for dinner."], at: L(40) + 0.09 },
        { lines: ["Saturdays at the lake."], at: L(40) + 1.42 },
      ],
    },
  );

  // The end card, centered: the logo, the line, Start Your Free Trial, sundeckpro.com.
  add(
    scene(card, tl.total, 10, (el) => {
      const bg = surface(el, "navy", false);
      const col = div("fill", el);
      css(col, {
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        gap: "0px",
      });
      const logo = img("/brand/logo/sundeck-logo-reverse.svg", col);
      css(logo, { width: 900, "margin-bottom": 44 });
      const line = div("display", col, "Build the company you set out to build.");
      css(line, { "font-size": 84, color: "var(--paper)", "margin-bottom": 64 });
      const btn = div("display", col, "Start Your Free Trial");
      css(btn, {
        height: 132,
        padding: "0 72px",
        "line-height": "138px",
        "border-radius": 66,
        background: "var(--safety)",
        color: "var(--navy)",
        "font-size": 80,
        "text-transform": "none",
        "margin-bottom": 40,
      });
      const url = div("", col, "sundeckpro.com");
      css(url, {
        font: "700 64px 'Public Sans', sans-serif",
        color: "var(--paper)",
        "letter-spacing": "0.01em",
      });
      const cta = L(43) - card;
      return (t) => {
        bg(t);
        // The cut lands on a settled card; only the button and the address arrive.
        const settle = expoOut(ramp(t, 0, 0.5));
        col.style.transform = `scale(${lerp(1.03, 1, settle)})`;
        const q = ramp(t, cta, cta + 0.3);
        btn.style.opacity = String(ramp(t, cta, cta + 0.034));
        btn.style.transform = `scale(${lerp(1.25, 1, slam(q))})`;
        const u = expoOut(ramp(t, cta + 0.4, cta + 0.8));
        url.style.opacity = String(ramp(t, cta + 0.4, cta + 0.45));
        url.style.transform = `translateY(${(1 - u) * 24}px)`;
      };
    }),
  );
  caps.push({
    place: "end",
    size: 104,
    until: card,
    items: [{ lines: ["Build the company", "you set out to build."], at: L(42) + 1.57 }],
  });

  for (const g of caps) add(captionScene(g));
}
