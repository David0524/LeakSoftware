// The film, shot by shot (docs/plans/launch-video.md, sections 4 and 8). Every shot hangs off a
// narration line, so the real voice files re-time it; inside a shot, beats are seconds from the
// line's start (the voice's own timing), clamped to the shot.
//
// Tech side: the owner's iPhone recordings (assets/owner/NN-*.mov, section 5's numbers) where
// they've arrived, else the app's real simulator screens. Owner side: the website's real screens.

import { clip, iphone, ownerStill, photoRef, stockRef, web, type Box } from "./assets.ts";
import {
  Browser,
  Phone,
  behindSheet,
  flick,
  pending,
  push,
  spring,
  type Layer,
} from "./devices.ts";
import {
  H,
  W,
  clamp,
  css,
  div,
  easeInOut,
  easeOut,
  expoOut,
  img,
  keys,
  lerp,
  ramp,
  slam,
  type Scene,
  type Stage,
} from "./engine.ts";
import {
  CAPTION_RIGHT,
  camAt,
  chapterCard,
  float,
  keyCaption,
  label,
  photo,
  rig,
  shake,
  slamText,
  slideIn,
  spread,
  subtitle,
  surface,
  type Cam,
  type Surface,
} from "./kit.ts";
import type { Timeline } from "../timing.ts";
import { chapters } from "../script.ts";

let tl: Timeline;
const line = (n: number) => tl.lines.find((l) => l.n === n)!;
/** When line n's shot ends: the next line, or the chapter card before it. */
function shotEnd(n: number) {
  const next = tl.lines.find((l) => l.n === n + 1);
  if (!next) return tl.total;
  const card = tl.cards.find((c) => c.chapter === next.chapter && c.end === next.start);
  return card ? card.start : next.start;
}

type Draw = (t: number, d: number) => void;

function scene(start: number, end: number, z: number, build: (el: HTMLElement) => Draw): Scene {
  return { start, end, z, build };
}

/** A shot for line n (or lines n…m), from its start to the next shot. */
function shot(n: number, build: (el: HTMLElement) => Draw, m = n): Scene {
  return scene(line(n).start, shotEnd(m), 10, build);
}

const CENTER: Cam = { s: 1, x: W / 2, y: H / 2 };

// ---------------------------------------------------------------------------
// Device helpers
// ---------------------------------------------------------------------------

interface PhoneRig {
  phone: Phone;
  x: number;
  y: number;
  /** A point on the screen (screenshot pixels, minus a scroll) in rig pixels. */
  at: (px: number, py: number, scroll?: number, srcWidth?: number) => { x: number; y: number };
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
    at: (px, py, scroll = 0, srcWidth = 1179) => {
      const k = phone.w / srcWidth;
      return { x: x + phone.bezel + px * k, y: y + phone.bezel + (py - scroll) * k };
    },
  };
}

interface BrowserRig {
  browser: Browser;
  x: number;
  y: number;
  at: (px: number, py: number, scroll?: number) => { x: number; y: number };
}

function placeBrowser(
  parent: HTMLElement,
  cx: number,
  cy: number,
  width = 1440,
  address = "sundeckpro.com",
): BrowserRig {
  const browser = new Browser(parent, width, address);
  const x = cx - browser.outerW / 2;
  const y = cy - browser.outerH / 2;
  css(browser.el, { transform: `translate(${x}px, ${y}px)` });
  return {
    browser,
    x,
    y,
    at: (px, py, scroll = 0) => ({
      x: x + px * browser.k,
      y: y + browser.bar + (py - scroll) * browser.k,
    }),
  };
}

/**
 * The camera moved (only ever left) so the stage's x `left` (a device's left edge) sits right of
 * the caption zone on screen.
 */
const rightOf = (c: Cam, left: number): Cam => ({
  ...c,
  x: Math.min(c.x, left - (CAPTION_RIGHT + 40 - W / 2) / c.s),
});

/**
 * A camera for the lens window (right of the caption): the page's capture-pixel `x` at the
 * window's left edge, `y` in the middle, at zoom `s`.
 */
const lensOn =
  (b: BrowserRig, x: number, y: number) =>
  (s: number): Cam => {
    const p = b.at(x, y);
    return { s, x: p.x + (W / 2 - (CAPTION_RIGHT + 80)) / s, y: p.y };
  };

/** The website's sticky header, in capture pixels (56 points at 2×). */
const NAV = 112;

/** A momentum scroll from `a` to `b` starting at `t0` (iOS-style: quick, then easing out). */
const glideTo = (t: number, t0: number, a: number, b: number, dur = 1.2) =>
  lerp(a, b, flickEase(ramp(t, t0, t0 + dur)));
const flickEase = (x: number) => 1 - Math.pow(1 - x, 3);

/**
 * A card being dragged on the website: a cut of the card from the page picture, lifted (a
 * shadow, slightly larger) and carried from where it was to where it's dropped, while its old
 * place shows faded.
 */
class Ghost {
  private card: HTMLDivElement;
  private hole: HTMLDivElement;
  private b: BrowserRig;
  private from: Box;
  private to: Box;
  constructor(b: BrowserRig, src: string, from: Box, to: Box) {
    this.b = b;
    this.from = from;
    this.to = to;
    const k = b.browser.k;
    this.hole = div("abs", b.browser.page);
    css(this.hole, {
      width: from.w * k,
      height: from.h * k,
      background: "rgba(242, 244, 247, 0.72)",
      "border-radius": 10,
    });
    this.card = div("abs", b.browser.page);
    css(this.card, {
      width: from.w * k,
      height: from.h * k,
      "background-image": `url(${src})`,
      "background-size": `${b.browser.w}px auto`,
      "background-position": `${-from.x * k}px ${-from.y * k}px`,
      "border-radius": 12,
      "box-shadow": "0 18px 40px rgba(16, 24, 40, 0.28), 0 0 0 1px rgba(16, 24, 40, 0.08)",
    });
  }
  /** Lifted at `t0`, dropped at `t1` (seconds), on a page scrolled by `scroll` image pixels. */
  draw(t: number, t0: number, t1: number, scroll: number) {
    const on = t >= t0 && t < t1;
    this.card.style.display = on ? "" : "none";
    this.hole.style.display = on ? "" : "none";
    if (!on) return;
    const k = this.b.browser.k;
    const p = easeInOut(ramp(t, t0 + 0.12, t1 - 0.05));
    const lift = easeOut(ramp(t, t0, t0 + 0.12));
    const x = lerp(this.from.x, this.to.x, p) * k;
    const y = (lerp(this.from.y, this.to.y, p) - scroll) * k;
    this.card.style.transform = `translate(${x}px, ${y}px) scale(${1 + 0.04 * lift}) rotate(${1.5 * lift}deg)`;
    this.hole.style.transform = `translate(${this.from.x * k}px, ${(this.from.y - scroll) * k}px)`;
  }
}

const mid = (b: Box | undefined, fallback: { x: number; y: number }) =>
  b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : fallback;

/** A camera on a point (rig pixels) at a zoom, with the float added. */
const on = (p: { x: number; y: number }, s: number): Cam => ({ s, x: p.x, y: p.y });

function setCam(r: ReturnType<typeof rig>, c: Cam, t: number, amount = 5) {
  const f = float(t, amount);
  r.set({ s: c.s, x: c.x - f.x / c.s, y: c.y - f.y / c.s });
}

const still = (...names: string[]) => {
  const s = iphone(...names);
  if (!s) throw new Error(`No iPhone screen ${names.join(" / ")}; run src/capture-iphone.ts`);
  return s;
};

/** Plays clip segments back to back: the clip time for shot time `t` at a speed. */
function segmentTime(t: number, segs: [number, number][], speed = 1): number {
  let left = Math.max(0, t) * speed;
  for (const [a, b] of segs) {
    if (left <= b - a) return a + left;
    left -= b - a;
  }
  return segs[segs.length - 1]![1];
}
const segLength = (segs: [number, number][]) => segs.reduce((n, [a, b]) => n + b - a, 0);

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

/** An iOS notification banner (the owner's phone in the cold open). */
function banner(parent: HTMLElement, from: string, text: string, y: number) {
  const el = div("abs", parent);
  css(el, {
    left: W / 2 - 330,
    top: y,
    width: 660,
    padding: "22px 26px",
    "border-radius": 30,
    background: "rgba(245, 247, 249, 0.94)",
    color: "var(--navy)",
    "box-shadow": "0 18px 0 rgba(0,0,0,0.25)",
    font: "500 26px/1.3 'Public Sans', sans-serif",
  });
  el.innerHTML = `<div style="display:flex;justify-content:space-between;font-weight:700;font-size:24px;margin-bottom:4px"><span>${from}</span><span style="font-weight:500;color:var(--n500)">now</span></div><div>${text}</div>`;
  return (t: number, at: number) => {
    const p = expoOut(ramp(t, at, at + 0.35));
    el.style.opacity = String(clamp(p * 3));
    el.style.transform = `translateY(${(1 - p) * -60}px) scale(${lerp(0.94, 1, p)})`;
  };
}

/**
 * Photos as a list of hard cuts: [from (seconds), photo, Ken Burns start, end, shade]. Each
 * plays its push from its cut to the next.
 */
function cutList(
  el: HTMLElement,
  list: [
    number,
    Parameters<typeof photo>[1],
    [number, number, number],
    [number, number, number],
    number,
  ][],
) {
  const parts = list.map(([at, ref, from, to, shade]) => {
    const wrap = div("fill", el);
    return { at, wrap, draw: photo(wrap, ref, from, to, shade) };
  });
  return (t: number, d: number) => {
    parts.forEach((p, i) => {
      const end = parts[i + 1]?.at ?? d;
      const on = t >= p.at && t < end;
      p.wrap.style.display = on ? "" : "none";
      if (on) p.draw(t - p.at, end - p.at);
    });
  };
}

/** A big clock stamp ("5:12 AM"). */
function stamp(parent: HTMLElement, text: string) {
  const el = label(parent, text, {
    position: "absolute",
    left: 110,
    top: 90,
    "font-size": 170,
    color: "var(--paper)",
    "text-shadow": "0 6px 0 rgba(0,0,0,0.35)",
  });
  return (t: number) => {
    const p = expoOut(ramp(t, 0.15, 0.5));
    el.style.opacity = String(clamp(p * 2));
    el.style.transform = `translateX(${(1 - p) * -40}px)`;
  };
}

/** A photo print (white border) that slides in, the way a tech's photos come off the phone. */
function print(parent: HTMLElement, src: string, x: number, y: number, w: number, rot: number) {
  const el = div("abs", parent);
  css(el, {
    left: x,
    top: y,
    width: w,
    padding: 14,
    background: "var(--paper)",
    "border-radius": 6,
    "box-shadow": "18px 24px 0 rgba(0,0,0,0.3)",
  });
  const i = img(src, el);
  pending.push(i.decode().catch(() => {}));
  css(i, { width: w - 28, height: (w - 28) * 0.62, "object-fit": "cover", display: "block" });
  return (t: number, at: number) => {
    const s = slideIn(t, at, 0.55, 700);
    el.style.opacity = String(s.o);
    el.style.transform = `translate(${s.x}px, ${s.x * 0.15}px) rotate(${rot + s.x * 0.01}deg)`;
  };
}

/**
 * The Dashboard card's own figure counting up: a live number over the card's printed one,
 * matched to it, that lands exactly on it and then gives way to the screenshot's own.
 */
function cardCount(b: BrowserRig, box: Box | undefined, cents: number) {
  const el = div("display", b.browser.page);
  const k = b.browser.k;
  const v = box ?? { x: 1066, y: 452, w: 330, h: 80 };
  css(el, {
    position: "absolute",
    left: v.x * k - 4,
    top: v.y * k - 2,
    width: v.w * k,
    height: v.h * k + 4,
    "padding-left": 4,
    "padding-right": 12,
    background: "#fff",
    color: "#102a43",
    "font-size": v.h * k * 0.82,
    "line-height": `${v.h * k + 4}px`,
    "font-weight": 700,
    "font-variant-numeric": "tabular-nums",
    "white-space": "nowrap",
    "text-transform": "none",
  });
  return (t: number, at: number, dur: number) => {
    const p = easeOut(ramp(t, at, at + dur));
    const c = Math.round(cents * p);
    el.textContent = `$${Math.floor(c / 100).toLocaleString("en-US")}.${String(c % 100).padStart(2, "0")}`;
    el.style.display = p >= 1 ? "none" : "";
  };
}

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

/** A device shot on a surface: builds a rig and hands it to `make`. */
function deviceShot(
  n: number,
  kind: Surface,
  make: (r: ReturnType<typeof rig>, el: HTMLElement) => Draw,
  m = n,
) {
  return shot(
    n,
    (el) => {
      const bg = surface(el, kind);
      const r = rig(el);
      const draw = make(r, el);
      return (t, d) => {
        bg(t);
        draw(t, d);
      };
    },
    m,
  );
}

export function buildFilm(stage: Stage, timeline: Timeline) {
  tl = timeline;
  const add = (s: Scene) => stage.add(s);

  // Cold open --------------------------------------------------------------------------
  // About two seconds a cut: the truck at dawn, the phone on the console as the texts come in,
  // a blurred whiteboard, the kitchen table at night, the work itself.
  add(
    scene(0, shotEnd(1), 10, (el) => {
      const s1 = line(1).start;
      const cuts = cutList(el, [
        [0, photoRef("01"), [1.02, 40, 50], [1.06, 44, 52], 0.15],
        [s1 + 2.4, photoRef("01"), [1.32, 62, 58], [1.38, 60, 56], 0.15],
        [s1 + 4.4, photoRef("04"), [1.03, 50, 55], [1.08, 52, 56], 0.2],
      ]);
      const s = stamp(el, "5:12 AM");
      return (t, d) => {
        cuts(t, d);
        s(t - s1 + 0.6);
      };
    }),
  );
  add(
    shot(2, (el) => {
      // The phone face down on the console, buzzing; the texts stack beside it.
      const cuts = cutList(el, [
        [0, photoRef("04"), [1.45, 55, 62], [1.5, 55, 62], 0.2],
        [2.2, photoRef("04"), [1.12, 50, 58], [1.16, 51, 58], 0.25],
        [4.3, photoRef("04"), [1.7, 52, 66], [1.76, 53, 66], 0.25],
      ]);
      const wbWrap = div("fill", el);
      const wb = photo(wbWrap, photoRef("02"), [1.15, 30, 50], [1.3, 70, 50], 0.2);
      css(wbWrap, { filter: "blur(2.5px)", "z-index": 3 });
      const b1 = banner(el, "Rebecca Quinn", "Is the tech coming today?", 120);
      const b2 = banner(el, "Janet Yates", "Did you get my check?", 290);
      const b3 = banner(el, "Ken Alvarez", "Can you come Thursday?", 460);
      const shakeEl = el;
      return (t, d) => {
        cuts(t, d);
        // After the third text, the whiteboard (a quick blurred whip), and no cut back.
        const wbAt = 6.0;
        wbWrap.style.display = t >= wbAt ? "" : "none";
        wb(t - wbAt, d - wbAt);
        const showBanners = t < wbAt;
        for (const [b, at] of [
          [b1, 2.6],
          [b2, 4.1],
          [b3, 5.4],
        ] as const)
          b(showBanners ? t : -1, at);
        // A buzz as each text lands.
        const k = [2.6, 4.1, 5.4].reduce((m, at) => m + shake(t, at, 6).x, 0);
        shakeEl.style.transform = `translateX(${k * 0.4}px)`;
      };
    }),
  );
  add(
    shot(3, (el) => {
      const cuts = cutList(el, [
        [0, photoRef("03"), [1.02, 50, 50], [1.06, 52, 48], 0.2],
        [2.5, photoRef("03"), [1.45, 62, 66], [1.5, 62, 64], 0.2],
      ]);
      const s = stamp(el, "10:04 PM");
      return (t, d) => {
        cuts(t, d);
        s(t);
      };
    }),
  );
  add(
    shot(4, (el) => {
      const cuts = cutList(el, [
        [0, photoRef("05"), [1.04, 50, 50], [1.1, 46, 48], 0.25],
        [2.4, stockRef("leak-dye-light-niche"), [1.05, 50, 50], [1.12, 54, 50], 0.25],
      ]);
      const text = slamText(el, ["You're great", "at the work."], { size: 150, y: 640, x: 110 });
      text.box.style.zIndex = "4";
      return (t, d) => {
        cuts(t, d);
        text.draw(t, spread(text.words, 0.15, 1.2));
      };
    }),
  );
  add(
    shot(5, (el) => {
      const wbWrap = div("fill", el);
      const wb = photo(wbWrap, photoRef("02"), [1.2, 60, 50], [1.35, 30, 50], 0.3);
      css(wbWrap, { filter: "blur(3px)" });
      const a = photo(el, photoRef("03"), [1.08, 50, 50], [1.16, 50, 45], 0.5);
      const text = slamText(el, ["The paperwork", "is running you."], {
        size: 160,
        align: "center",
      });
      const black = div("fill", el);
      css(black, { background: "#000" });
      return (t, d) => {
        wb(t, 0.9);
        wbWrap.style.zIndex = "2";
        wbWrap.style.display = t < 0.85 ? "" : "none";
        a(t, d);
        text.box.style.zIndex = "3";
        // Centered type comes in a line at a time, so each line sits centered as it lands.
        text.draw(t, [1.0, 1.0, 2.15, 2.15, 2.15]);
        black.style.zIndex = "4";
        // Black only for the last moment before the hit (never an empty held frame).
        black.style.opacity = String(ramp(t, d - 0.45, d - 0.12));
      };
    }),
  );

  // The turn ---------------------------------------------------------------------------
  add(
    shot(6, (el) => {
      const bg = surface(el, "steel", false);
      const text = slamText(el, ["Not anymore."], { size: 280, align: "center" });
      // The hit lands just after the words.
      const hitAt = tl.hit - line(6).start;
      return (t) => {
        bg(t);
        text.draw(t, [0, 0]);
        const k = shake(t, hitAt, 20);
        text.box.style.transform = `translate(${k.x}px, ${k.y}px)`;
      };
    }),
  );
  add(
    shot(7, (el) => {
      const bg = surface(el, "navy", false);
      const logo = img("/brand/logo/sundeck-logo-reverse.svg", el, "abs");
      css(logo, { width: 1000, left: W / 2 - 500, top: H / 2 - 170 });
      // Five hard cuts on the beat (2, 1, 2, 1, 2 beats, about a second each): the week, Today,
      // a report, a quote accepted, the dashboard.
      const shots = div("fill", el);
      const tile = (kind: Surface) => {
        const f = div("fill", shots);
        surface(f, kind, false)(0);
        return f;
      };
      const t1 = tile("steel");
      placeBrowser(t1, W / 2, 410, 1180)
        .browser.layer(web("dispatch-4").src)
        .set(0);
      const t2 = tile("concrete");
      const today = clip("02");
      const p2 = placePhone(t2, W / 2, 410, 330, { time: "6:29" });
      if (today) p2.phone.clip(today).set(0);
      else p2.phone.layer(still("lv-today").src).set(0);
      const t3 = tile("steel");
      placeBrowser(t3, W / 2, 410, 1180, "sundeckpro.com/r/…")
        .browser.layer(web("report-desktop").src)
        .set(0);
      const t4 = tile("concrete");
      placePhone(t4, W / 2, 410, 330, { time: "10:05" })
        .phone.layer(web("phone-quote-accepted").src)
        .set(
          Math.min(
            web("phone-quote-accepted").height - 2600,
            Math.max(0, (web("phone-quote-accepted").boxes.heading?.y ?? 1300) - 900),
          ),
        );
      const t5 = tile("steel");
      placeBrowser(t5, W / 2, 410, 1180)
        .browser.layer(web("vs-dashboard").src)
        .set(0);
      const tiles = [t1, t2, t3, t4, t5];
      const words = slamText(el, ["Your whole shop."], { size: 130, align: "center", y: 850 });
      const words2 = slamText(el, ["In your pocket."], { size: 130, align: "center", y: 850 });
      const words3 = slamText(el, ["On every truck."], { size: 130, align: "center", y: 850 });
      return (t) => {
        bg(t);
        const beat = tl.beat;
        const m0 = 2 * beat;
        const starts = [0, 2, 3, 5, 6].map((k) => m0 + k * beat);
        const p = slam(ramp(t, 0, 0.3));
        logo.style.transform = `scale(${lerp(1.5, 1, p)})`;
        logo.style.opacity = String(ramp(t, 0, 0.06) * (t < m0 ? 1 : 0));
        let i = -1;
        starts.forEach((st, k) => {
          if (t >= st) i = k;
        });
        tiles.forEach((tile, k) => {
          tile.style.display = i === k ? "" : "none";
          tile.style.transformOrigin = "50% 38%";
          tile.style.transform = `scale(${1 + Math.max(0, t - starts[k]!) * 0.035})`;
        });
        shots.style.display = t >= m0 ? "" : "none";
        const w2 = starts[2]!;
        const w3 = starts[3]!;
        words.box.style.display = t >= m0 && t < w2 ? "" : "none";
        words2.box.style.display = t >= w2 && t < w3 ? "" : "none";
        words3.box.style.display = t >= w3 ? "" : "none";
        for (const w of [words, words2, words3]) w.box.style.zIndex = "5";
        words.draw(t, [m0, m0, m0]);
        words2.draw(t, [w2, w2, w2]);
        words3.draw(t, [w3, w3, w3]);
      };
    }),
  );

  // Chapter cards ----------------------------------------------------------------------
  for (const card of tl.cards) {
    const c = chapters.find((x) => x.id === card.chapter)!;
    add(scene(card.start, card.end, 10, (el) => chapterCard(el, c.number!, c.title!)));
  }

  // 01 Dispatch (desktop) --------------------------------------------------------------
  // The office's real week on the Canyon State video shop (capture-web.ts "dispatch-*"): the
  // board, Laura Bennett's new leak detection dropped from Needs a Time onto Tuesday and dragged
  // to Jake, then Optimize Week and its result; then the tech's own day on the iPhone.
  add(
    deviceShot(8, "steel", (r) => {
      const d0 = web("dispatch-0");
      const b = placeBrowser(r.el, W / 2, H / 2 + 10, 1500);
      const layer = b.browser.layer(d0.src).pin(NAV);
      return (t, d) => {
        const scroll = glideTo(t, 1.6, 0, 420, 1.4);
        layer.set(scroll);
        setCam(
          r,
          camAt(t, [
            [0, { s: 0.97, x: W / 2, y: H / 2 }],
            [0.9, { s: 0.97, x: W / 2, y: H / 2 }],
            [2.2, on(b.at(1300, 1450, 420), 1.5)],
            [d, on(b.at(1500, 1420, 420), 1.58)],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(9, "steel", (r) => {
      const d0 = web("dispatch-0");
      const d1 = web("dispatch-1");
      const d2 = web("dispatch-2");
      const b = placeBrowser(r.el, W / 2, H / 2 + 10, 1500);
      const l0 = b.browser.layer(d0.src).pin(NAV);
      const l1 = b.browser.layer(d1.src).pin(NAV);
      const l2 = b.browser.layer(d2.src).pin(NAV);
      // Laura's card in Needs a Time, then on Dana's Tuesday, then on Jake's (image pixels).
      const grip0 = mid(d0.boxes.laura, { x: 552, y: 546 });
      const grip1 = mid(d1.boxes.laura, { x: 1623, y: 1239 });
      const grip2 = mid(d2.boxes.laura, { x: 1623, y: 1705 });
      const tray = { x: 88, y: grip0.y - 60, w: 512, h: 120 };
      const onDana = { x: 1286, y: grip1.y - 52, w: 380, h: 104 };
      const onJake = { x: 1286, y: grip2.y - 52, w: 380, h: 104 };
      const g1 = new Ghost(b, d0.src, tray, onDana);
      const g2 = new Ghost(b, d1.src, onDana, onJake);
      const scroll = 260;
      return (t) => {
        const drop1 = 1.45;
        const drop2 = 3.15;
        const k1 = ramp(t, drop1, drop1 + 0.12);
        const k2 = ramp(t, drop2, drop2 + 0.12);
        l0.set(scroll, 1);
        l1.set(scroll, k1);
        l2.set(scroll, k2);
        b.browser.drawTap(0, grip0.x, grip0.y, t - 0.15, scroll);
        g1.draw(t, 0.6, drop1, scroll);
        b.browser.drawTap(1, grip1.x, grip1.y, t - 1.85, scroll);
        g2.draw(t, 2.3, drop2, scroll);
        setCam(
          r,
          camAt(t, [
            [0, on(b.at(1000, 1000, scroll), 1.3)],
            [1.6, on(b.at(1150, 1150, scroll), 1.35)],
            [3.4, on(b.at(1250, 1400, scroll), 1.45)],
            [5, on(b.at(1280, 1430, scroll), 1.5)],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(10, "steel", (r, el) => {
      const d2 = web("dispatch-2");
      const d3 = web("dispatch-3");
      const d4 = web("dispatch-4");
      const b = placeBrowser(r.el, W / 2, H / 2 + 10, 1500);
      const l2 = b.browser.layer(d2.src).pin(NAV);
      const l3 = b.browser.layer(d3.src).pin(NAV);
      const l4 = b.browser.layer(d4.src).pin(NAV);
      const btn = mid(d2.boxes.optimizeWeek ?? d3.boxes.optimizeWeek, { x: 2652, y: 506 });
      const sheet = mid(d3.boxes.sheet, { x: 1440, y: 1180 });
      const confirm = mid(d3.boxes.confirm, { x: 1440, y: 1614 });
      const result = mid(d4.boxes.banner, { x: 1398, y: 203 });
      // The tech's own day on the phone: the recording's Optimize and its result.
      const c = clip("03");
      const p = c ? placePhone(r.el, 1460, H / 2, 430, { time: "6:22" }) : null;
      const rec = c && p ? p.phone.clip(c) : null;
      if (p) p.phone.el.style.opacity = "0";
      const cap = keyCaption(el, "Build the week in minutes.\nNot hours.");
      return (t, d) => {
        const toPhone = d - 2.9;
        const k3 = ramp(t, 0.85, 1.05);
        const k4 = ramp(t, 2.35, 2.5);
        const onPhone = t >= toPhone && !!rec;
        l2.set(0, 1);
        l3.set(0, k3);
        l4.set(0, k4);
        b.browser.el.style.display = onPhone ? "none" : "";
        b.browser.drawTap(0, btn.x, btn.y, t - 0.4, 0, { w: 330, h: 88, r: 44 });
        b.browser.drawTap(1, confirm.x, confirm.y, t - 1.9, 0, { w: 960, h: 88, r: 44 });
        if (rec && p) {
          p.phone.el.style.opacity = onPhone ? "1" : "0";
          // Its last moments: Optimize pressed and "Optimized · 39 min less driving".
          rec.set(c!.duration - 2.9 + Math.max(0, t - toPhone));
        }
        r.lens(onPhone ? 0 : ramp(t, 3.2, 3.6));
        const board = on(b.at(1250, 1250), 1.4);
        const phoneTop = p ? { x: p.x + p.phone.outerW / 2, y: p.y + p.phone.outerH * 0.4 } : null;
        setCam(
          r,
          onPhone && phoneTop
            ? camAt(t - toPhone, [
                [0, { s: 1.2, x: phoneTop.x - 380 / 1.2, y: phoneTop.y }],
                [3, { s: 1.26, x: phoneTop.x - 380 / 1.26, y: phoneTop.y - 10 }],
              ])
            : camAt(t, [
                [0, on(b.at(1900, 700), 1.35)],
                [0.5, on(b.at(btn.x - 200, btn.y + 120), 1.75)],
                [1.0, on(b.at(btn.x - 200, btn.y + 120), 1.75)],
                [1.6, on(b.at(sheet.x, sheet.y), 1.5)],
                [2.3, on(b.at(sheet.x, sheet.y + 80), 1.55)],
                [2.7, on(b.at(result.x + 120, result.y + 220), 2.0)],
                [3.2, on(b.at(result.x + 120, result.y + 220), 2.05)],
                [3.7, { s: board.s, x: board.x - 420 / board.s, y: board.y }],
                [d, { s: board.s + 0.05, x: board.x - 420 / board.s, y: board.y }],
              ]),
          t,
        );
        cap(t - 3.4, d - 3.4);
      };
    }),
  );

  // 02 On the road (iPhone) ------------------------------------------------------------
  add(
    deviceShot(11, "concrete", (r) => {
      // The owner's recording: Today, laid out. Then the parts the voice names: the next stop,
      // the gate code, the dog in the yard (the recording's own last frame, pushed in on).
      const c = clip("02");
      const p = placePhone(r.el, W / 2, H / 2, 430, { time: "6:29" });
      const l = c ? p.phone.clip(c) : p.phone.layer(still("lv-today").src);
      const at = (x: number, y: number) =>
        c
          ? {
              x: p.x + p.phone.bezel + (x * p.phone.w) / c.width,
              y:
                p.y +
                p.phone.bezel +
                (p.phone.h - (c.height * p.phone.w) / c.width) +
                (y * p.phone.w) / c.width,
            }
          : p.at(x * 1.6375, y * 1.6375);
      const card = at(360, 420);
      const code = at(250, 760);
      const dog = at(300, 815);
      return (t, d) => {
        if (c) (l as ReturnType<Phone["clip"]>).set(t);
        else (l as Layer).set(0);
        setCam(
          r,
          camAt(t, [
            [0, { s: 1.0, x: W / 2, y: H / 2 }],
            [2.4, { s: 1.04, x: W / 2, y: H / 2 }],
            [3.3, on(card, 1.9)],
            [4.4, on(card, 1.95)],
            [5.0, on(code, 2.1)],
            [5.7, on(code, 2.15)],
            [6.2, on(dog, 2.2)],
            [d, on(dog, 2.26)],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(12, "concrete", (r) => {
      // The owner's recording: the tap on the message button, the text Messages writes for her
      // ("Hi Rebecca, this is Dana from Canyon State Leak Detections. I'm on my way"), then
      // "On the way".
      const c = clip("01");
      const p = placePhone(r.el, W / 2, H / 2, 430, { time: "6:29" });
      if (!c) {
        const l = p.phone.layer(still("lv-today").src);
        return (t) => {
          l.set(0);
          setCam(r, CENTER, t);
        };
      }
      const l = p.phone.clip(c);
      const k = p.phone.w / c.width;
      const top = p.phone.h - c.height * k;
      const at = (x: number, y: number) => ({
        x: p.x + p.phone.bezel + x * k,
        y: p.y + p.phone.bezel + top + y * k,
      });
      // The rest of the message (from "and should be there" to its end, with the recording's
      // night-time arrival) covered in the bubble's own white, so the text ends at "on my way".
      const soft = (x: number, y: number, w: number, h: number) => {
        const el = div("abs", p.phone.screen);
        css(el, {
          left: x * k,
          top: top + y * k,
          width: w * k,
          height: h * k,
          background: "rgb(252, 252, 252)",
          "z-index": 12,
        });
        return el;
      };
      const softs = [soft(280, 802, 334, 34), soft(138, 836, 470, 37)];
      const segs: [number, number][] = [
        [0.6, 2.1],
        [3.05, 4.75],
        [5.6, 6.7],
      ];
      const tCompose = 2.1 - 0.6;
      const tBack = tCompose + 4.75 - 3.05;
      const button = at(720 * 0.63, 1478 * 0.483);
      const bubble = at(330, 800);
      const cardAt = at(360, 420);
      return (t, d) => {
        const ct = segmentTime(t, segs);
        l.set(ct);
        const composing = ct >= 3.0 && ct < 5.5;
        for (const s of softs) s.style.display = composing ? "" : "none";
        p.phone.tapAt(0, button.x - p.x - p.phone.bezel, button.y - p.y - p.phone.bezel, t - 0.4, {
          w: p.phone.w * 0.085,
          h: p.phone.w * 0.085,
        });
        setCam(
          r,
          camAt(t, [
            [0, on(cardAt, 1.25)],
            [tCompose - 0.05, on(cardAt, 1.3)],
            [tCompose, on(bubble, 2.3)],
            [tBack - 0.05, on(bubble, 2.38)],
            [tBack, on(cardAt, 1.5)],
            [d, on(cardAt, 1.56)],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(13, "concrete", (r, el) => {
      const lock = ownerStill("01");
      const p = placePhone(r.el, W / 2 + 330, H / 2, 430, {
        status: lock ? "light" : "dark",
        time: "6:31",
      });
      const src = lock?.url ?? still("66-live-activity-lock").src;
      const width = lock?.width ?? 1179;
      const height = lock?.height ?? 2556;
      const l = p.phone.layer(src, width);
      // The owner's screenshot stops below the status bar: it sits at the bottom of the screen.
      const top = Math.max(0, p.phone.h - (height * p.phone.w) / width);
      css(p.phone.screen, { background: "var(--navy)" });
      css(l.el, { top });
      const at0 = p.at(width * 0.5, height * 0.72, 0, width);
      const activity = { x: at0.x, y: at0.y + top };
      const cap = keyCaption(el, "Your crew knows\nexactly where to be.");
      return (t, d) => {
        l.set(0);
        setCam(
          r,
          camAt(t, [
            [0, rightOf({ s: 1.0, x: W / 2 + 100, y: H / 2 }, p.x)],
            [1.0, rightOf(on(activity, 1.55), p.x)],
            [d, rightOf(on(activity, 1.6), p.x)],
          ]),
          t,
        );
        cap(t - 0.3, d - 0.3);
      };
    }),
  );

  // 03 Find the leak -------------------------------------------------------------------
  add(
    deviceShot(14, "concrete", (r, el) => {
      const gauge = div("fill", el);
      const g = photo(gauge, photoRef("05"), [1.03, 50, 50], [1.1, 50, 50], 0.1);
      gauge.style.zIndex = "5";
      const p = placePhone(r.el, W / 2, H / 2, 430, { time: "8:42" });
      // Today → tap the stop → the job pushes in → flick down the checklist → tap the line that
      // dropped → its pressure test comes up as a sheet.
      const today = p.phone.layer(still("lv-today", "30-today").src);
      const job = p.phone.layer(still("lv-checklist", "09-checklist").src);
      const test = p.phone.sheet(still("lv-pressure-test", "13-test-editor").src);
      const t0 = 1.4;
      const tPush = t0 + 0.5;
      const tFlick = tPush + 0.75;
      const tDrop = tFlick + 1.15;
      const tSheet = tDrop + 0.5;
      const dropped = test.at(420, 1670);
      return (t, d) => {
        g(t, t0);
        gauge.style.display = t < t0 ? "" : "none";
        const pp = spring(t - tPush, 0.5);
        const mv = push(pp, p.phone.w);
        const sp = spring(t - tSheet);
        today.set(0, pp < 1 ? 1 : 0, mv.from);
        const scroll = flick(t, tFlick, 0, 600);
        job.set(scroll, pp > 0 ? 1 : 0, { ...mv.to, ...behindSheet(sp) });
        test.set(sp);
        p.phone.drawTap(0, 590, 2064, t - (tPush - 0.45), 0, { w: 1100, h: 150, r: 30 });
        // The Returns line's leak button (it dropped: Leaking).
        p.phone.drawTap(1, 644, 1728, t - (tDrop - 0.45), scroll, { w: 116, h: 104 });
        setCam(
          r,
          camAt(t, [
            [t0, { s: 1.0, x: W / 2, y: H / 2 }],
            [tSheet + 0.3, { s: 1.0, x: W / 2, y: H / 2 }],
            [
              tSheet + 0.9,
              on({ x: p.x + p.phone.bezel + dropped.x, y: p.y + p.phone.bezel + dropped.y }, 1.45),
            ],
            [
              d,
              on({ x: p.x + p.phone.bezel + dropped.x, y: p.y + p.phone.bezel + dropped.y }, 1.52),
            ],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(15, "concrete", (r, el) => {
      // "Dye at the light niche" (the owner's photo), "Pin it on the pool" (the owner's recording:
      // pool shape, an arrow and "Leak" on the diagram), "Snap the photo" (the print).
      const dye = div("fill", el);
      const dp = photo(dye, stockRef("leak-dye-light-niche"), [1.05, 50, 50], [1.15, 50, 45], 0.05);
      dye.style.zIndex = "5";
      const c5 = clip("05");
      const p = placePhone(
        r.el,
        W / 2 - 260,
        H / 2,
        420,
        c5 ? { status: "none", island: false } : {},
      );
      const findings = c5 ? null : p.phone.layer(still("lv-findings", "10-findings").src);
      const l5 = c5 ? p.phone.clip(c5) : null;
      const pr = print(r.el, stockRef("leak-dye-light-niche").url ?? "", W / 2 + 60, 250, 640, 3);
      const flash = div("fill", el);
      css(flash, { background: "var(--paper)", "z-index": 6 });
      // The recording's meaningful moments: Roman shape and the spa, the arrow, the result.
      const segs: [number, number][] = [
        [3.0, 5.0],
        [11.2, 13.2],
        [24.7, 26.3],
      ];
      return (t, d) => {
        const b1 = 1.3;
        const b2 = 2.6;
        dp(t, b1);
        dye.style.display = t < b1 ? "" : "none";
        if (l5) l5.set(segmentTime(t - b1, segs, Math.max(1, segLength(segs) / (d - b1 - 0.3))));
        findings?.set(0);
        if (!c5) p.phone.drawTap(0, 240, 1358, t - b1 - 0.3);
        pr(t, b2 + 0.1);
        flash.style.opacity = String(Math.max(0, 0.85 - (t - b2) * 6) * (t >= b2 ? 1 : 0));
        setCam(
          r,
          camAt(t, [
            [b1, { s: 1.0, x: W / 2, y: H / 2 }],
            [d, { s: 1.05, x: W / 2 + 20, y: H / 2 }],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(16, "concrete", (r, el) => {
      // "Say what you see": Voice Note on the finding; then back (a pop) to the job's record.
      const p = placePhone(r.el, W / 2 + 330, H / 2, 430, { time: "9:20" });
      const findings = p.phone.layer(still("lv-findings", "10-findings").src);
      const voice = p.phone.layer(still("lv-voice-note", "12-component").src);
      const tests = p.at(590, 2500, 1300);
      const mic = p.at(866, 2270, 1500);
      const cap = keyCaption(el, "Every test. Every finding.\nOn record.");
      const tPop = 2.2;
      return (t, d) => {
        const pp = spring(t - tPop, 0.5);
        // A pop: the screen slides off to the right, the one under it comes back from the left.
        voice.set(1500, pp < 1 ? 1 : 0, { dx: p.phone.w * pp });
        const scroll = flick(t, tPop + 0.7, 600, 1300);
        findings.set(scroll, pp > 0 ? 1 : 0, {
          dx: -0.3 * p.phone.w * (1 - pp),
          dim: 0.12 * (1 - pp),
        });
        p.phone.drawTap(0, 866, 2270, t - 0.5, 1500, { w: 500, h: 170, r: 40 });
        setCam(
          r,
          camAt(t, [
            [0, rightOf(on(mic, 1.35), p.x)],
            [tPop - 0.1, rightOf(on(mic, 1.4), p.x)],
            [tPop + 0.5, rightOf(on(p.at(590, 1300), 1.0), p.x)],
            [d, rightOf(on(tests, 1.2), p.x)],
          ]),
          t,
        );
        cap(t - 0.6, d - 0.6);
      };
    }),
  );

  // 04 Prove it ------------------------------------------------------------------------
  add(
    deviceShot(17, "steel", (r) => {
      // Rebecca's real report (the Canyon State video shop): the logo, the findings, then its own
      // Photos section, with the dye photo the tech took.
      const rep = web("report-desktop");
      const b = placeBrowser(r.el, W / 2, H / 2 + 10, 1500, "sundeckpro.com/r/…");
      const l = b.browser.layer(rep.src);
      const found = rep.boxes.found ?? { x: 608, y: 1369, w: 1664, h: 74 };
      const photos = rep.boxes.photos ?? { x: 608, y: 4781, w: 1664, h: 74 };
      const pic = rep.boxes.photo ?? { x: 608, y: 4879, w: 816, h: 544 };
      const s1 = Math.max(0, found.y - 260);
      const s2 = Math.min(rep.height - 1800, Math.max(0, photos.y - 200));
      return (t, d) => {
        const scroll = t < 3.6 ? glideTo(t, 1.7, 0, s1, 1.1) : glideTo(t, 3.6, s1, s2, 1.2);
        l.set(scroll);
        setCam(
          r,
          camAt(t, [
            [0, on(b.at(1440, 330, 0), 1.6)],
            [1.6, on(b.at(1440, 330, 0), 1.66)],
            [2.6, on(b.at(1440, found.y + 360, s1), 1.6)],
            [3.5, on(b.at(1440, found.y + 380, s1), 1.64)],
            [4.6, on(b.at(pic.x + pic.w / 2 + 120, pic.y + pic.h / 2 - 60, s2), 1.85)],
            [d, on(b.at(pic.x + pic.w / 2 + 120, pic.y + pic.h / 2 - 60, s2), 2.0)],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(18, "steel", (r) => {
      // On the tech's phone: the report's draft is ready, Customer Signs, Review with Customer,
      // her signature; then the report on her own phone, signed.
      const tech = placePhone(r.el, W / 2 - 300, H / 2, 430, { time: "9:42" });
      const cust = placePhone(r.el, W / 2 + 330, H / 2, 430, { time: "9:45" });
      const job = tech.phone.layer(still("lv-findings").src);
      const draft = tech.phone.sheet(still("lv-send-report").src);
      const sign = tech.phone.sheet(still("lv-review-sign").src);
      const signed = tech.phone.sheet(still("lv-signed").src);
      const rep = web("phone-report");
      const custLayer = cust.phone.layer(rep.src);
      const sigs = Math.min(
        rep.height - 2600,
        Math.max(0, (rep.boxes.signatures?.y ?? 9000) - 700),
      );
      const review = sign.at(434, 922);
      return (t) => {
        const sp = spring(t - 0.05);
        job.set(0, 1, behindSheet(sp));
        // Inside the sheet: the draft, then (pushed) Customer Signs, then her signature on it.
        const pp = spring(t - 0.75, 0.45);
        const mv = push(pp, tech.phone.w);
        draft.set(sp, 0, pp < 1 ? 1 : 0, mv.from);
        sign.set(sp, 0, pp > 0 && t < 2.0 ? 1 : 0, mv.to);
        signed.set(sp, 0, ramp(t, 1.95, 2.15));
        tech.phone.tapAt(0, review.x, review.y, t - 1.05, {
          w: 652 * sign.k,
          h: 132 * sign.k,
          r: 66 * sign.k,
        });
        custLayer.set(flick(t, 2.9, Math.max(0, sigs - 900), sigs, 1.2));
        const s = slideIn(t, 2.5, 0.6, 1200);
        cust.phone.el.style.transform = `translate(${cust.x + s.x}px, ${cust.y}px)`;
        cust.phone.el.style.opacity = String(t >= 2.5 ? 1 : 0);
        setCam(
          r,
          camAt(t, [
            [0, on(tech.at(590, 1100), 1.2)],
            [2.2, on(tech.at(590, 1150), 1.25)],
            [2.9, { s: 1.0, x: W / 2, y: H / 2 }],
            [6, { s: 1.03, x: W / 2, y: H / 2 }],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(19, "steel", (r, el) => {
      const rep = web("phone-report");
      const p = placePhone(r.el, W / 2 + 360, H / 2, 430, { time: "9:50" });
      const l = p.phone.layer(rep.src);
      const cap = keyCaption(el, "A report that looks like\na big company sent it.");
      return (t, d) => {
        l.set(
          keys(t, [
            [0, 0],
            [0.8, 0],
            [d, Math.min(4200, rep.height - 2600)],
          ]),
        );
        setCam(
          r,
          camAt(t, [
            [0, rightOf({ s: 1.15, x: p.x + p.phone.outerW / 2, y: H / 2 - 40 }, p.x)],
            [d, rightOf({ s: 1.2, x: p.x + p.phone.outerW / 2, y: H / 2 - 40 }, p.x)],
          ]),
          t,
        );
        cap(t - 0.4, d - 0.4);
      };
    }),
  );

  // 05 Close it on the spot ------------------------------------------------------------
  add(
    deviceShot(20, "concrete", (r) => {
      // The quote sheet over the job: both findings' price book lines, then the lines below.
      const p = placePhone(r.el, W / 2, H / 2, 430, { time: "9:46" });
      const job = p.phone.layer(still("lv-findings").src);
      const quote = p.phone.sheet(still("lv-quote").src);
      return (t, d) => {
        const sp = spring(t - 0.1);
        job.set(0, 1, behindSheet(sp));
        const scroll = flick(t, 2.4, 0, 620, 1.2);
        quote.set(sp, scroll);
        const chip1 = quote.at(546, 927, scroll);
        const chip2 = quote.at(546, 1179, scroll);
        p.phone.tapAt(0, chip1.x, chip1.y, t - 0.6, {
          w: 876 * quote.k,
          h: 132 * quote.k,
          r: 66 * quote.k,
        });
        p.phone.tapAt(1, chip2.x, chip2.y, t - 1.4, {
          w: 900 * quote.k,
          h: 132 * quote.k,
          r: 66 * quote.k,
        });
        const head = quote.at(590, 900, 0);
        const lines = quote.at(590, 1900, 620);
        const at = (q: { x: number; y: number }) => ({
          x: p.x + p.phone.bezel + q.x,
          y: p.y + p.phone.bezel + q.y,
        });
        setCam(
          r,
          camAt(t, [
            [0, { s: 1, x: W / 2, y: H / 2 }],
            [0.9, on(at(head), 1.5)],
            [2.3, on(at(head), 1.55)],
            [3.4, on(at(lines), 1.4)],
            [d, on(at(lines), 1.45)],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(21, "concrete", (r) => {
      // Her own phone: the quote at Accept This Quote, the terms switch turned on, Accept Quote,
      // then the same page accepted with the deposit received.
      const open = web("phone-quote-open");
      const agreed = web("phone-quote-agreed");
      const done = web("phone-quote-accepted");
      const p = placePhone(r.el, W / 2, H / 2, 430, { time: "10:05" });
      const l1 = p.phone.layer(open.src);
      const l2 = p.phone.layer(agreed.src);
      const l3 = p.phone.layer(done.src);
      const top1 = Math.min(open.height - 2600, Math.max(0, (open.boxes.heading?.y ?? 2400) - 900));
      const top3 = Math.min(done.height - 2600, Math.max(0, (done.boxes.heading?.y ?? 1300) - 900));
      const sw = mid(open.boxes.agree, { x: 1000, y: 2900 });
      const acc = mid(open.boxes.accept, { x: 590, y: 3150 });
      const accW = open.boxes.accept?.w ?? 1000;
      return (t) => {
        const scroll = flick(t, 0.0, top1 - 500, top1, 0.9);
        const on2 = ramp(t, 1.25, 1.35);
        const on3 = ramp(t, 2.6, 2.85);
        l1.set(scroll, 1);
        l2.set(scroll, on2);
        l3.set(top3, on3);
        p.phone.drawTap(0, sw.x, sw.y, t - 0.85, scroll);
        p.phone.drawTap(1, acc.x, acc.y, t - 1.9, scroll, { w: accW, h: 130, r: 65 });
        setCam(
          r,
          camAt(t, [
            [0, { s: 1.12, x: W / 2, y: H / 2 + 40 }],
            [4.0, { s: 1.18, x: W / 2, y: H / 2 + 30 }],
          ]),
          t,
        );
      };
    }),
  );
  add(
    shot(22, (el) => {
      const p = photo(el, photoRef("07"), [1.03, 50, 50], [1.1, 50, 45], 0.55);
      const a = slamText(el, ["No callbacks."], { size: 130, x: 110, y: 120 });
      const b = slamText(el, ["No “let me think", "about it.”"], { size: 130, x: 110, y: 260 });
      const c = slamText(el, ["Done."], { size: 230, x: 110, y: 510, accent: ["Done"] });
      const cap = keyCaption(el, "They say yes\nbefore you leave.");
      return (t, d) => {
        p(t, d);
        a.draw(t, spread(2, 0.1, 0.4));
        b.draw(t, spread(b.words, 1.0, 2.1));
        c.draw(t, [2.95]);
        const k = shake(t, 2.95, 10);
        c.box.style.transform = `translate(${k.x}px, ${k.y}px)`;
        cap(t - 0.9, d - 0.9);
      };
    }),
  );

  // 06 Every pool, every week -----------------------------------------------------------
  add(
    deviceShot(23, "steel", (r, el) => {
      // A pool route shop's week (Blue Mesa, the pool video shop): its plans fill the board.
      const pool = div("fill", el);
      const pp = photo(pool, photoRef("06"), [1.03, 50, 50], [1.1, 50, 50], 0.1);
      pool.style.zIndex = "5";
      const week = web("bm-week");
      const b = placeBrowser(r.el, W / 2, H / 2 + 10, 1500);
      const l = b.browser.layer(week.src).pin(NAV);
      const scroll = Math.min(900, week.height - 1800);
      return (t, d) => {
        pp(t, 1.3);
        pool.style.display = t < 1.3 ? "" : "none";
        l.set(glideTo(t, 1.5, 250, scroll, 1.6));
        setCam(
          r,
          camAt(t, [
            [1.3, on(b.at(1700, 1300, 250), 1.3)],
            [d, on(b.at(1750, 1900, scroll), 1.42)],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(24, "concrete", (r) => {
      const p = placePhone(r.el, W / 2, H / 2, 430, { time: "1:30" });
      // Today → the pool stop pushes in → Chemical → What to Add comes up as a sheet.
      const today = p.phone.layer(still("lv-today-pool").src);
      const visit = p.phone.layer(still("lv-cleanings").src);
      const add = p.phone.sheet(still("lv-what-to-add").src);
      const tPush = 1.15;
      const tSheet = 2.95;
      const dose = add.at(560, 830);
      return (t, d) => {
        const pp = spring(t - tPush, 0.5);
        const mv = push(pp, p.phone.w);
        const sp = spring(t - tSheet);
        today.set(0, pp < 1 ? 1 : 0, mv.from);
        visit.set(0, pp > 0 ? 1 : 0, { ...mv.to, ...behindSheet(sp) });
        add.set(sp);
        p.phone.drawTap(0, 590, 2508, t - (tPush - 0.45), 0, { w: 1100, h: 150, r: 30 });
        p.phone.drawTap(1, 590, 1025, t - (tSheet - 0.45), 0, { w: 1100, h: 140, r: 30 });
        const focus = { x: p.x + p.phone.bezel + dose.x, y: p.y + p.phone.bezel + dose.y };
        setCam(
          r,
          camAt(t, [
            [0, { s: 1.12, x: W / 2, y: H / 2 }],
            [tSheet + 0.3, { s: 1.12, x: W / 2, y: H / 2 }],
            [tSheet + 0.9, on(focus, 1.6)],
            [d, on(focus, 1.66)],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(25, "concrete", (r) => {
      const p = placePhone(r.el, W / 2 - 280, H / 2, 430, { time: "1:52" });
      const before = print(r.el, stockRef("pool-before").url ?? "", W / 2 + 40, 160, 560, -3);
      const after = print(r.el, stockRef("pool-after").url ?? "", W / 2 + 120, 480, 560, 3);
      const l = p.phone.layer(still("lv-cleanings").src);
      const filter = p.at(590, 1528);
      return (t, d) => {
        l.set(0);
        before(t, 2.0);
        after(t, 2.7);
        p.phone.drawTap(0, 707, 794, t - (d - 1.6), 0, { w: 330, h: 105 });
        setCam(
          r,
          camAt(t, [
            [0, on(filter, 1.55)],
            [1.6, on(filter, 1.55)],
            [2.2, { s: 1.08, x: W / 2, y: H / 2 }],
            [d - 1.4, { s: 1.08, x: W / 2, y: H / 2 }],
            [d - 0.9, on(p.at(707, 794), 1.5)],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(26, "concrete", (r, el) => {
      // The homeowner's visit report on their phone: the water test, what was done, the photos.
      const yard = div("fill", r.el);
      const yp = photo(yard, stockRef("hero-backyard"), [1.04, 50, 50], [1.1, 45, 50], 0.35);
      const rep = web("phone-visit-report");
      const p = placePhone(r.el, W / 2 + 420, H / 2, 430, { status: "light", time: "1:58" });
      const l = p.phone.layer(rep.src);
      const end = Math.max(0, rep.height - 2600);
      const cap = keyCaption(el, "Your route runs itself.");
      return (t, d) => {
        yp(t, d);
        const scroll = flick(t, 3.4, flick(t, 1.0, 0, end * 0.45, 1.2), end, 1.3);
        l.set(scroll);
        p.phone.statusBar(scroll > 500 ? "dark" : "light", "1:58");
        setCam(r, CENTER, t, 3);
        cap(t - 0.6, d - 0.6);
      };
    }),
  );

  // 07 Spot the upsell -----------------------------------------------------------------
  add(
    deviceShot(27, "concrete", (r, el) => {
      const pad = div("fill", el);
      const pp = photo(pad, stockRef("equipment-pad"), [1.03, 40, 60], [1.12, 30, 65], 0.1);
      pad.style.zIndex = "5";
      const p = placePhone(r.el, W / 2 + 360, H / 2, 430, { time: "2:05" });
      const cap = keyCaption(el, "Every visit can be a sale.");
      // The finding as a sheet over the visit, then (dismissed) the quote from it.
      const visit = p.phone.layer(still("lv-cleanings").src);
      const finding = p.phone.sheet(still("lv-pump-finding").src);
      const quote = p.phone.sheet(still("lv-pump-quote").src);
      const tPad = 1.4;
      return (t, d) => {
        pp(t, tPad);
        pad.style.display = t < tPad ? "" : "none";
        const f = spring(t - (tPad + 0.1)) * (1 - spring(t - 3.9, 0.35));
        const q = spring(t - 4.25);
        visit.set(0, 1, behindSheet(Math.max(f, q)));
        finding.set(f);
        quote.set(q);
        setCam(
          r,
          camAt(t, [
            [tPad, rightOf({ s: 1.12, x: p.x + p.phone.outerW / 2, y: H / 2 - 60 }, p.x)],
            [d, rightOf({ s: 1.2, x: p.x + p.phone.outerW / 2, y: H / 2 - 80 }, p.x)],
          ]),
          t,
        );
        cap(t - 4.6, d - 4.6);
      };
    }),
  );

  // 08 Get paid ------------------------------------------------------------------------
  add(
    deviceShot(28, "steel", (r) => {
      // The office's invoices: every one sent, and what's been paid.
      const inv = web("vs-invoices");
      const b = placeBrowser(r.el, W / 2, H / 2 + 10, 1500);
      const bl = b.browser.layer(inv.src);
      return (t, d) => {
        bl.set(0);
        setCam(
          r,
          camAt(t, [
            [0, { s: 1.0, x: W / 2, y: H / 2 }],
            [0.8, { s: 1.0, x: W / 2, y: H / 2 }],
            [2.0, on(b.at(1250, 760), 1.55)],
            [d, on(b.at(1450, 860), 1.62)],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(29, "concrete", (r) => {
      const p = placePhone(r.el, W / 2, H / 2, 430, { time: "2:15" });
      // Record Payment as a sheet over the job; after it, Send Receipt.
      const job = p.phone.layer(still("lv-findings").src);
      const pay = p.phone.sheet(still("lv-record-payment").src);
      const receipt = p.phone.sheet(still("lv-send-receipt").src);
      const record = pay.at(580, 1200);
      const send = receipt.at(580, 1204);
      return (t) => {
        const a = spring(t - 0.1) * (1 - spring(t - 1.75, 0.35));
        const b = spring(t - 2.1);
        job.set(0, 1, behindSheet(Math.max(a, b)));
        pay.set(a);
        receipt.set(b);
        p.phone.tapAt(0, record.x, record.y, t - 0.95, { w: 1080 * pay.k, h: 110 * pay.k });
        p.phone.tapAt(1, send.x, send.y, t - 3.3, { w: 1080 * receipt.k, h: 110 * receipt.k });
        setCam(
          r,
          camAt(t, [
            [0, on(p.at(590, 1000), 1.35)],
            [4.5, on(p.at(590, 1150), 1.4)],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(30, "steel", (r, el) => {
      // What's come in: the paid invoices.
      const paid = web("vs-invoices-paid");
      const b = placeBrowser(r.el, W / 2, H / 2 + 10, 1500);
      const l = b.browser.layer(paid.src);
      const cap = keyCaption(el, "Stop chasing checks.");
      const focus = lensOn(b, 140, 820);
      return (t, d) => {
        l.set(0);
        r.lens(ramp(t, 0.1, 0.5));
        setCam(
          r,
          camAt(t, [
            [0, focus(1.3)],
            [d, focus(1.36)],
          ]),
          t,
        );
        cap(t - 0.4, d - 0.4);
      };
    }),
  );

  // 09 The command center ---------------------------------------------------------------
  add(
    deviceShot(31, "steel", (r, el) => {
      const dash = web("vs-dashboard");
      const b = placeBrowser(r.el, W / 2, H / 2 + 10, 1500);
      const l = b.browser.layer(dash.src);
      const words = slamText(el, ["Every truck.", "Every job.", "Every dollar."], {
        size: 150,
        x: 110,
        y: 230,
        accent: ["dollar"],
      });
      const shade = div("fill", el);
      css(shade, { background: "var(--navy)" });
      words.box.style.zIndex = "3";
      shade.style.zIndex = "2";
      return (t, d) => {
        l.set(0);
        setCam(
          r,
          camAt(t, [
            [0, on(b.at(1440, 700), 1.15)],
            [d, on(b.at(1440, 760), 1.25)],
          ]),
          t,
        );
        shade.style.opacity = String(0.82 * ramp(t, 2.1, 2.3));
        words.draw(t, [2.3, 2.45, 3.25, 3.4, 4.25, 4.4]);
      };
    }),
  );
  add(
    deviceShot(32, "steel", (r) => {
      const dash = web("vs-dashboard");
      const b = placeBrowser(r.el, W / 2, H / 2 + 10, 1500);
      const l = b.browser.layer(dash.src);
      const pt = (k: string, f: { x: number; y: number }) => {
        const m = mid(dash.boxes[k], f);
        return b.at(m.x + 260, m.y + 50);
      };
      // What came in (the card counts up to its own figure), what's still owed, what was billed,
      // who said yes.
      const collected = pt("collected", { x: 1300, y: 420 });
      const owed = pt("owed", { x: 2200, y: 420 });
      const invoiced = pt("invoiced", { x: 1300, y: 720 });
      const quotes = pt("quotes", { x: 400, y: 720 });
      // The card's own figure, read off the page when it was captured.
      const figure = Math.round(
        Number((dash.texts?.collected ?? "$0").replace(/[^0-9.]/g, "")) * 100,
      );
      const count = cardCount(b, dash.boxes.collectedValue, figure);
      return (t, d) => {
        l.set(0);
        count(t, 0.1, 0.9);
        setCam(
          r,
          camAt(
            t,
            [
              [0, on(collected, 1.9)],
              [1.7, on(collected, 1.9)],
              [2.1, on(owed, 1.9)],
              [3.1, on(owed, 1.9)],
              [3.5, on(invoiced, 1.9)],
              [4.3, on(invoiced, 1.9)],
              [4.7, on(quotes, 1.9)],
              [d, on(quotes, 1.95)],
            ],
            easeInOut,
          ),
          t,
          2,
        );
      };
    }),
  );
  add(
    deviceShot(33, "steel", (r, el) => {
      // The shop's Activity: Rebecca's morning as it came in.
      const act = web("vs-activity");
      const b = placeBrowser(r.el, W / 2, H / 2 + 10, 1500);
      const l = b.browser.layer(act.src).pin(NAV);
      const row = act.boxes.payment ?? act.boxes.quoteAccepted;
      const focus = lensOn(b, (row?.x ?? 320) - 60, (row?.y ?? 700) + 280);
      const cap = keyCaption(el, "Every truck. Every job.\nEvery dollar. One screen.");
      return (t, d) => {
        l.set(0);
        r.lens(ramp(t, 0.1, 0.5));
        setCam(
          r,
          camAt(t, [
            [0, focus(1.35)],
            [d, focus(1.42)],
          ]),
          t,
        );
        cap(t - 0.4, d - 0.4);
      };
    }),
  );

  // 10 Keep them coming back ------------------------------------------------------------
  add(
    deviceShot(34, "steel", (r) => {
      // The offer written (in the capture browser; never sent), and Send to every customer.
      const em = web("email");
      const b = placeBrowser(r.el, W / 2, H / 2 + 10, 1500);
      const l = b.browser.layer(em.src);
      const send = mid(em.boxes.send, { x: 300, y: 1400 });
      const subject = mid(em.boxes.subject, { x: 700, y: 900 });
      const sendW = em.boxes.send?.w ?? 360;
      return (t, d) => {
        l.set(0);
        b.browser.drawTap(0, send.x, send.y, t - (d - 2.0), 0, { w: sendW, h: 80 });
        setCam(
          r,
          camAt(t, [
            [0, { s: 1.0, x: W / 2, y: H / 2 }],
            [1.0, on(b.at(subject.x + 200, subject.y + 120), 1.6)],
            [d - 2.4, on(b.at(subject.x + 200, subject.y + 300), 1.6)],
            [d - 1.6, on(b.at(send.x + 420, send.y - 180), 1.6)],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(35, "steel", (r, el) => {
      const s = web("vs-settings-reminders");
      const b = placeBrowser(r.el, W / 2, H / 2 + 10, 1500);
      const l = b.browser.layer(s.src);
      const cap = keyCaption(el, "Customers who come back.\nAnd send their friends.");
      const focus = lensOn(b, 740, 760);
      return (t, d) => {
        l.set(0);
        r.lens(ramp(t, 0.8, 1.2));
        setCam(
          r,
          camAt(t, [
            [0, on(b.at(1400, 760), 1.4)],
            [1.0, focus(1.3)],
            [d, focus(1.34)],
          ]),
          t,
        );
        cap(t - 1.0, d - 1.0);
      };
    }),
  );

  // 11 Built for the backyard -----------------------------------------------------------
  add(
    deviceShot(36, "concrete", (r, el) => {
      // No signal at the pool: Airplane Mode, the job saying what's waiting on this phone; then
      // back in range, the same job, caught up.
      const yard = div("fill", r.el);
      const yp = photo(yard, photoRef("06"), [1.04, 50, 50], [1.1, 50, 48], 0.3);
      const p = placePhone(r.el, W / 2 + 420, H / 2, 430, { time: "8:46" });
      const off = p.phone.layer(still("lv-offline").src);
      const on2 = p.phone.layer(still("lv-checklist").src);
      const cap = keyCaption(el, "No signal? No problem.");
      const back = 5.0;
      const bar = p.at(590, 470);
      return (t, d) => {
        yp(t, d);
        const synced = ramp(t, back, back + 0.3);
        off.set(0, 1);
        on2.set(0, synced);
        p.phone.statusBar("dark", t < back ? "8:46" : "8:52", t < back);
        setCam(
          r,
          camAt(t, [
            [0, rightOf({ s: 1.05, x: W / 2 + 100, y: H / 2 }, p.x)],
            [1.4, rightOf(on(bar, 1.5), p.x)],
            [d, rightOf(on(bar, 1.55), p.x)],
          ]),
          t,
          3,
        );
        cap(t - 0.8, d - 0.8);
      };
    }),
  );
  add(
    deviceShot(37, "concrete", (r, el) => {
      // Big buttons, one hand: Today in dark mode at dawn, Start and Directions under the thumb.
      const dawn = div("fill", r.el);
      const dp = photo(dawn, photoRef("01"), [1.05, 45, 50], [1.1, 45, 52], 0.25);
      void el;
      const p = placePhone(r.el, W / 2 + 300, H / 2, 430, {
        status: "light",
        time: "6:04",
        dark: true,
      });
      const l = p.phone.layer(still("lv-today-dark").src);
      const y = 1534;
      return (t, d) => {
        dp(t, d);
        l.set(0);
        p.phone.drawTap(0, 352, y, t - 0.7, 0, { w: 520, h: 150, r: 75 });
        p.phone.drawTap(1, 1018, y, t - 2.0, 0, { w: 150, h: 150, r: 75 });
        setCam(
          r,
          camAt(t, [
            [0, { s: 1.0, x: W / 2 + 120, y: H / 2 }],
            [0.6, on(p.at(640, y), 1.55)],
            [d, on(p.at(640, y), 1.62)],
          ]),
          t,
        );
      };
    }),
  );

  // 12 The vision ----------------------------------------------------------------------
  add(
    shot(38, (el) => {
      const p = photo(el, photoRef("08"), [1.0, 50, 50], [1.08, 50, 50]);
      return (t, d) => p(t, d);
    }),
  );
  add(
    shot(39, (el) => {
      const a = photo(el, photoRef("08"), [1.08, 50, 50], [1.12, 55, 50], 0.25);
      const bw = div("fill", el);
      const b = photo(bw, photoRef("09"), [1.02, 50, 50], [1.08, 50, 48], 0.25);
      const cw = div("fill", el);
      const c = photo(cw, photoRef("07"), [1.02, 50, 50], [1.08, 50, 50], 0.3);
      const t1 = slamText(el, ["Another truck."], { size: 170, x: 110, y: 720 });
      const t2 = slamText(el, ["Another crew."], { size: 170, x: 110, y: 720 });
      const t3 = slamText(el, ["A bigger name", "in town."], { size: 170, x: 110, y: 560 });
      for (const x of [t1, t2, t3]) x.box.style.zIndex = "4";
      return (t, d) => {
        a(t, d);
        bw.style.display = t >= 1.35 ? "" : "none";
        b(t - 1.35, d);
        cw.style.display = t >= 2.6 ? "" : "none";
        c(t - 2.6, d);
        t1.box.style.display = t < 1.35 ? "" : "none";
        t2.box.style.display = t >= 1.35 && t < 2.6 ? "" : "none";
        t3.box.style.display = t >= 2.6 ? "" : "none";
        t1.draw(t, [0.1, 0.4]);
        t2.draw(t, [1.35, 1.65]);
        t3.draw(t, spread(t3.words, 2.6, 3.4));
      };
    }),
  );
  add(
    shot(40, (el) => {
      const a = photo(el, photoRef("10"), [1.02, 50, 50], [1.08, 50, 50], 0.2);
      const bw = div("fill", el);
      const b = photo(bw, photoRef("11"), [1.02, 50, 50], [1.08, 50, 50], 0.2);
      const t1 = slamText(el, ["Home for dinner."], { size: 170, x: 110, y: 720 });
      const t2 = slamText(el, ["Saturdays", "at the lake."], { size: 170, x: 110, y: 560 });
      for (const x of [t1, t2]) x.box.style.zIndex = "4";
      return (t, d) => {
        a(t, d);
        bw.style.display = t >= 1.5 ? "" : "none";
        b(t - 1.5, d + 6);
        t1.box.style.display = t < 1.5 ? "" : "none";
        t2.box.style.display = t >= 1.5 ? "" : "none";
        t1.draw(t, spread(3, 0.05, 0.6));
        t2.draw(t, spread(t2.words, 1.5, 2.3));
      };
    }),
  );
  add(
    shot(41, (el) => {
      const a = photo(el, photoRef("11"), [1.08, 50, 50], [1.16, 50, 50], 0.35);
      const text = slamText(el, ["You started it", "to build something."], {
        size: 160,
        x: 110,
        y: 560,
        accent: ["build"],
      });
      return (t, d) => {
        a(t, d);
        text.draw(t, spread(text.words, 2.7, 4.3));
      };
    }),
  );
  add(
    shot(42, (el) => {
      const bg = surface(el, "navy", false);
      const logo = img("/brand/logo/sundeck-logo-reverse.svg", el, "abs");
      css(logo, { width: 760, left: W / 2 - 380, top: 250 });
      const text = slamText(el, ["Build the company", "you set out to build."], {
        size: 130,
        align: "center",
        y: 560,
      });
      return (t) => {
        bg(t);
        const p = slam(ramp(t, 0, 0.3));
        logo.style.transform = `scale(${lerp(1.4, 1, p)})`;
        logo.style.opacity = String(ramp(t, 0, 0.06));
        text.draw(t, [1.0, 1.0, 1.0, 1.9, 1.9, 1.9, 1.9, 1.9]);
      };
    }),
  );

  // End card ---------------------------------------------------------------------------
  add(
    scene(line(43).start, tl.total, 10, (el) => {
      const bg = surface(el, "navy", false);
      const logo = img("/brand/logo/sundeck-logo-reverse.svg", el, "abs");
      css(logo, { width: 760, left: W / 2 - 380, top: 250 });
      const btn = div("display", el, "Start Your Free Trial");
      css(btn, {
        position: "absolute",
        left: W / 2 - 400,
        width: 800,
        top: 600,
        height: 130,
        "line-height": "136px",
        "border-radius": 65,
        background: "var(--safety)",
        color: "var(--navy)",
        "font-size": 76,
        "text-align": "center",
        "text-transform": "none",
      });
      const url = div("", el, "sundeckpro.com");
      css(url, {
        position: "absolute",
        left: 0,
        width: W,
        top: 790,
        "text-align": "center",
        font: "600 48px 'Public Sans', sans-serif",
        color: "var(--paper)",
        "letter-spacing": "0.02em",
      });
      const fade = div("fill", el);
      css(fade, { background: "#000" });
      return (t, d) => {
        bg(t);
        const p = expoOut(ramp(t, 0.5, 1.0));
        btn.style.opacity = String(clamp(p * 2));
        btn.style.transform = `scale(${lerp(0.85, 1, slam(ramp(t, 0.5, 0.85)))})`;
        url.style.opacity = String(ramp(t, 1.0, 1.4));
        fade.style.opacity = String(ramp(t, d - 0.8, d));
      };
    }),
  );

  // Narration subtitles: only while the cut is timed by placeholders (to judge pacing).
  if (tl.mode !== "voice") {
    for (const l of tl.lines) {
      add(scene(l.start, Math.max(l.end, l.start + 2.5), 50, (el) => subtitle(el, l.text)));
    }
  }
}

/** Unused-import guard for helpers kept for later shots. */
export const _keep = { easeOut };
