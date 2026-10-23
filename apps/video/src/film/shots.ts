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

const mid = (b: Box | undefined, fallback: { x: number; y: number }) =>
  b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : fallback;

/** A camera on a point (rig pixels) at a zoom, with the float added. */
const on = (p: { x: number; y: number }, s: number): Cam => ({ s, x: p.x, y: p.y });
/** The same, with the point right of center, clear of a key caption on the left. */
const onRight = (p: { x: number; y: number }, s: number): Cam => ({ s, x: p.x - 420 / s, y: p.y });

function setCam(r: ReturnType<typeof rig>, c: Cam, t: number, amount = 5) {
  const f = float(t, amount);
  r.set({ s: c.s, x: c.x - f.x / c.s, y: c.y - f.y / c.s });
}

/** Shows one of several layers by time: [from, layer, scroll(t)]. Hard cuts between them. */
function sequence(t: number, items: [number, Layer, (t: number) => number][]) {
  let active = 0;
  items.forEach(([from], i) => {
    if (t >= from) active = i;
  });
  items.forEach(([, layer, scroll], i) => layer.set(scroll(t), i === active ? 1 : 0));
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

/** A number on a navy chip that counts up (the Dashboard's own figure). */
function counter(parent: HTMLElement, caption: string, cents: number, x: number, y: number) {
  const el = div("abs", parent);
  css(el, {
    left: x,
    top: y,
    padding: "22px 34px 18px",
    background: "var(--navy)",
    "border-left": "10px solid var(--water)",
  });
  const cap = label(el, caption.toUpperCase(), { "font-size": 34, color: "var(--n300)" });
  const num = label(el, "", {
    "font-size": 120,
    color: "var(--paper)",
    "font-variant-numeric": "tabular-nums",
  });
  void cap;
  return (t: number, at: number, dur = 1.6) => {
    const p = easeOut(ramp(t, at, at + dur));
    const v = Math.round(cents * p);
    num.textContent = `$${Math.floor(v / 100).toLocaleString("en-US")}.${String(v % 100).padStart(2, "0")}`;
    const s = expoOut(ramp(t, at - 0.2, at + 0.2));
    el.style.opacity = String(s);
    el.style.transform = `translateX(${(1 - s) * -80}px)`;
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
  add(
    scene(0, shotEnd(1), 10, (el) => {
      const p = photo(el, photoRef("01"), [1.02, 40, 50], [1.08, 46, 52], 0.15);
      const s = stamp(el, "5:12 AM");
      return (t, d) => {
        p(t, d);
        s(t - line(1).start + 0.6);
      };
    }),
  );
  add(
    shot(2, (el) => {
      const a = photo(el, photoRef("04"), [1.02, 50, 50], [1.1, 52, 55], 0.25);
      const wbWrap = div("fill", el);
      const wb = photo(wbWrap, photoRef("02"), [1.15, 30, 50], [1.3, 70, 50], 0.2);
      css(wbWrap, { filter: "blur(2.5px)" });
      const b1 = banner(el, "Rebecca Quinn", "Is the tech coming today?", 120);
      const b2 = banner(el, "Janet Yates", "Did you get my check?", 290);
      const b3 = banner(el, "Ken Alvarez", "Can you come Thursday?", 460);
      return (t, d) => {
        a(t, d);
        // The whiteboard: a quick blurred whip, never a readable hold.
        const wbOn = t > d * 0.5 && t < d * 0.5 + 0.9;
        wbWrap.style.display = wbOn ? "" : "none";
        wb(t - d * 0.5, 0.9);
        b1(t, 2.6);
        b2(t, 4.1);
        b3(t, 5.4);
      };
    }),
  );
  add(
    shot(3, (el) => {
      const p = photo(el, photoRef("03"), [1.02, 50, 50], [1.1, 54, 46], 0.2);
      const s = stamp(el, "9:47 PM");
      return (t, d) => {
        p(t, d);
        s(t);
      };
    }),
  );
  add(
    shot(4, (el) => {
      const a = photo(el, photoRef("05"), [1.04, 50, 50], [1.12, 46, 48], 0.25);
      const bWrap = div("fill", el);
      const b = photo(bWrap, stockRef("leak-dye-skimmer"), [1.05, 50, 50], [1.14, 54, 50], 0.25);
      const text = slamText(el, ["You're great", "at the work."], { size: 150, y: 640, x: 110 });
      return (t, d) => {
        a(t, d);
        bWrap.style.display = t > d * 0.55 ? "" : "none";
        b(t - d * 0.55, d * 0.45);
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
        text.draw(t, [1.0, 1.25, 2.15, 2.4, 2.7]);
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
      return (t) => {
        bg(t);
        text.draw(t, [0, 0.32]);
        const k = shake(t, 0, 20);
        text.box.style.transform = `translate(${k.x}px, ${k.y}px)`;
      };
    }),
  );
  add(
    shot(7, (el) => {
      const bg = surface(el, "navy", false);
      const logo = img("/brand/logo/sundeck-logo-reverse.svg", el, "abs");
      css(logo, { width: 1000, left: W / 2 - 500, top: H / 2 - 170 });
      // The montage: about a second each, real screens: the week, Today, a report, a quote
      // accepted, the dashboard.
      const shots = div("fill", el);
      const tile = (kind: Surface) => {
        const f = div("fill", shots);
        surface(f, kind, false)(0);
        return f;
      };
      const t1 = tile("steel");
      placeBrowser(t1, W / 2, 410, 1180)
        .browser.layer(web("week").src)
        .set(0);
      const t2 = tile("concrete");
      const today = clip("02");
      const p2 = placePhone(t2, W / 2, 410, 330);
      if (today) p2.phone.clip(today).set(0);
      else p2.phone.layer(still("30-today").src).set(0);
      const t3 = tile("steel");
      placeBrowser(t3, W / 2, 410, 1180, "sundeckpro.com/r/…")
        .browser.layer(web("report-desktop").src)
        .set(0);
      const t4 = tile("concrete");
      placePhone(t4, W / 2, 410, 330)
        .phone.layer(web("phone-quote-accepted").src)
        .set(
          Math.min(
            web("phone-quote-accepted").height - 2600,
            Math.max(0, (web("phone-quote-accepted").boxes.heading?.y ?? 1300) - 400),
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
      return (t, d) => {
        bg(t);
        const beat = tl.beat;
        const p = slam(ramp(t, 0, 0.3));
        logo.style.transform = `scale(${lerp(1.5, 1, p)})`;
        logo.style.opacity = String(ramp(t, 0, 0.06) * (t < 1.6 ? 1 : 0));
        const m0 = 1.6;
        const i = Math.min(tiles.length - 1, Math.floor((t - m0) / (beat * 1.5)));
        tiles.forEach((tile, k) => {
          const on = t >= m0 && i === k;
          tile.style.display = on ? "" : "none";
          const local = t - m0 - i * beat * 1.5;
          tile.style.transformOrigin = "50% 38%";
          tile.style.transform = `scale(${1 + local * 0.035})`;
        });
        shots.style.display = t >= m0 ? "" : "none";
        words.box.style.display = t >= m0 && t < 2.8 ? "" : "none";
        words2.box.style.display = t >= 2.8 && t < 4.0 ? "" : "none";
        words3.box.style.display = t >= 4.0 ? "" : "none";
        for (const w of [words, words2, words3]) w.box.style.zIndex = "5";
        words.draw(t, spread(3, 1.6, 2.0));
        words2.draw(t, spread(3, 2.8, 3.2));
        words3.draw(t, spread(3, 4.0, 4.4));
        void d;
      };
    }),
  );

  // Chapter cards ----------------------------------------------------------------------
  for (const card of tl.cards) {
    const c = chapters.find((x) => x.id === card.chapter)!;
    add(scene(card.start, card.end, 10, (el) => chapterCard(el, c.number!, c.title!)));
  }

  // 01 Dispatch (desktop) --------------------------------------------------------------
  add(
    deviceShot(8, "steel", (r) => {
      const b = placeBrowser(r.el, W / 2, H / 2 + 10, 1500);
      const week = web("week");
      const layer = b.browser.layer(week.src);
      return (t, d) => {
        const scroll = keys(t, [
          [0, 0],
          [d * 0.55, 0],
          [d, Math.min(700, week.height - 1800)],
        ]);
        layer.set(scroll);
        setCam(
          r,
          camAt(t, [
            [0, { s: 0.94, x: W / 2, y: H / 2 }],
            [d, { s: 1.04, x: W / 2 + 40, y: H / 2 + 10 }],
          ]),
          t,
        );
      };
    }),
  );
  if (clip("03")) {
    // The owner's recording: Schedule on the phone, a job dragged from Needs a Time into the
    // route, then Optimize ("Optimized · 39 min less driving"), beside the week on the website.
    add(
      deviceShot(
        9,
        "steel",
        (r, el) => {
          const c = clip("03")!;
          const week = web("week");
          const b = placeBrowser(r.el, 700, H / 2 + 20, 1180);
          const bl = b.browser.layer(week.src);
          const p = placePhone(r.el, 1500, H / 2, 420);
          const l = p.phone.clip(c);
          const cap = keyCaption(el, "Build the week in minutes. Not hours.");
          const d10 = line(10).start - line(9).start;
          const clipH = (c.height * p.phone.w) / c.width;
          // The banner ("Optimized · 39 min less driving") and the map at the top; never the stop
          // times further down (the owner recorded at night).
          const banner = {
            x: p.x + p.phone.bezel + p.phone.w / 2,
            y: p.y + p.phone.bezel + (p.phone.h - clipH) + clipH * 0.2,
          };
          return (t, d) => {
            bl.set(0);
            // Real time, held on the last frame to the end.
            const speed = Math.max(1, c.duration / (d - 1.8));
            l.set(t * speed);
            const result = (c.duration - 2.6) / speed;
            setCam(
              r,
              camAt(t, [
                [0, { s: 1, x: W / 2, y: H / 2 }],
                [2.0, { s: 1.02, x: W / 2 + 120, y: H / 2 }],
                [result, { s: 1.02, x: W / 2 + 120, y: H / 2 }],
                [result + 0.8, on(banner, 1.5)],
                [d, on(banner, 1.55)],
              ]),
              t,
            );
            cap(t - d10 - 4.6, d - d10 - 4.6);
          };
        },
        10,
      ),
    );
  } else {
    add(
      deviceShot(9, "steel", (r) => {
        const day = web("day");
        const b = placeBrowser(r.el, W / 2, H / 2 + 10, 1500);
        const layer = b.browser.layer(day.src);
        const tray = mid(day.boxes.needsATime, { x: 300, y: 600 });
        const trayAt = b.at(tray.x, tray.y);
        const c = clip("03");
        let phoneRig: PhoneRig | null = null;
        let clipLayer: ReturnType<Phone["clip"]> | null = null;
        if (c) {
          phoneRig = placePhone(r.el, 1560, H / 2 + 40, 380);
          clipLayer = phoneRig.phone.clip(c);
        }
        return (t, d) => {
          layer.set(0);
          b.browser.drawTap(0, tray.x, tray.y, t - 0.9);
          if (clipLayer) {
            clipLayer.set(t * Math.max(1, c!.duration / d));
            setCam(
              r,
              camAt(t, [
                [0, { s: 0.92, x: W / 2 + 100, y: H / 2 }],
                [d, { s: 0.98, x: W / 2 + 140, y: H / 2 }],
              ]),
              t,
            );
          } else {
            setCam(
              r,
              camAt(t, [
                [0, { s: 0.95, x: W / 2, y: H / 2 }],
                [1.4, on(trayAt, 1.25)],
                [d, { s: 1.12, x: W / 2 + 120, y: H / 2 }],
              ]),
              t,
            );
          }
        };
      }),
    );
    add(
      deviceShot(10, "steel", (r, el) => {
        const week = web("week");
        const sheet = web("week-optimize-sheet");
        const b = placeBrowser(r.el, W / 2, H / 2 + 10, 1500);
        const l1 = b.browser.layer(week.src);
        const l2 = b.browser.layer(sheet.src);
        const btn = mid(week.boxes.optimizeWeek, { x: 2600, y: 500 });
        const sheetBox = mid(sheet.boxes.sheet, { x: 1440, y: 900 });
        const confirm = mid(sheet.boxes.confirm, { x: 1440, y: 1300 });
        const cap = keyCaption(el, "Build the week in minutes. Not hours.");
        return (t, d) => {
          sequence(t, [
            [0, l1, () => 0],
            [1.5, l2, () => 0],
          ]);
          b.browser.drawTap(0, btn.x, btn.y, t - 0.8);
          b.browser.drawTap(1, confirm.x, confirm.y, t - 3.4);
          setCam(
            r,
            camAt(t, [
              [0, { s: 0.95, x: W / 2, y: H / 2 }],
              [1.2, on(b.at(btn.x, btn.y), 1.5)],
              [1.6, on(b.at(btn.x, btn.y), 1.5)],
              [2.6, on(b.at(sheetBox.x, sheetBox.y), 1.45)],
              [d, on(b.at(sheetBox.x, sheetBox.y + 60), 1.55)],
            ]),
            t,
          );
          cap(t - 4.6, d - 4.6);
        };
      }),
    );
  }

  // 02 On the road (iPhone) ------------------------------------------------------------
  add(
    deviceShot(11, "concrete", (r) => {
      const c = clip("02");
      const p = placePhone(r.el, W / 2, H / 2, 420);
      if (c) {
        const l = p.phone.clip(c);
        const card = p.at(c.width * 0.5, c.height * 0.42, 0, c.width);
        return (t, d) => {
          l.set(t - 2.0);
          setCam(
            r,
            camAt(t, [
              [0, { s: 1, x: W / 2, y: H / 2 }],
              [1.8, on(card, 1.35)],
              [d, on(card, 1.42)],
            ]),
            t,
          );
        };
      }
      const s = still("lv-today", "30-today");
      const l = p.phone.layer(s.src);
      return (t, d) => {
        l.set(
          keys(t, [
            [0, 0],
            [d * 0.5, 0],
            [d, 900],
          ]),
        );
        setCam(
          r,
          camAt(t, [
            [0, CENTER],
            [d, on(p.at(590, 1500), 1.3)],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(12, "concrete", (r) => {
      const c = clip("01");
      const p = placePhone(r.el, W / 2, H / 2, 420);
      if (c) {
        const l = p.phone.clip(c);
        // Today, the tap on On My Way, then the card reading "On the way". The Messages step
        // in between is left out.
        const segs: [number, number][] = [
          [0, 1.9],
          [5.5, c.duration - 0.05],
        ];
        const clipH = (c.height * p.phone.w) / c.width;
        const top = p.phone.h - clipH;
        const bubble = { x: p.phone.w * 0.63, y: top + clipH * 0.483 };
        return (t, d) => {
          l.set(segmentTime(t, segs));
          p.phone.tapAt(0, bubble.x, bubble.y, t - 1.45, {
            w: p.phone.w * 0.085,
            h: p.phone.w * 0.085,
          });
          setCam(
            r,
            camAt(t, [
              [0, { s: 1.04, x: W / 2, y: H / 2 }],
              [d, { s: 1.1, x: W / 2, y: H / 2 + 20 }],
            ]),
            t,
          );
        };
      }
      const s = still("lv-today", "30-today");
      const l = p.phone.layer(s.src);
      return (t) => {
        l.set(0);
        p.phone.drawTap(0, 703, 1660, t - 0.5);
        setCam(r, CENTER, t);
      };
    }),
  );
  add(
    deviceShot(13, "concrete", (r, el) => {
      const lock = ownerStill("01");
      const p = placePhone(r.el, W / 2 + 330, H / 2, 420, {
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
      const cap = keyCaption(el, "Your crew knows exactly where to be.");
      return (t, d) => {
        l.set(0);
        setCam(
          r,
          camAt(t, [
            [0, { s: 1, x: W / 2, y: H / 2 }],
            [1.6, on(activity, 1.7)],
            [d, on(activity, 1.78)],
          ]),
          t,
        );
        cap(t - 2.2, d - 2.2);
      };
    }),
  );

  // 03 Find the leak -------------------------------------------------------------------
  add(
    deviceShot(14, "concrete", (r, el) => {
      const gauge = div("fill", el);
      const g = photo(gauge, photoRef("05"), [1.03, 50, 50], [1.1, 50, 50], 0.1);
      gauge.style.zIndex = "5";
      const p = placePhone(r.el, W / 2, H / 2, 420);
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
        const scroll = flick(t, tFlick, 0, 1350);
        job.set(scroll, pp > 0 ? 1 : 0, { ...mv.to, ...behindSheet(sp) });
        test.set(sp);
        p.phone.drawTap(0, 590, 2064, t - (tPush - 0.45), 0, { w: 1100, h: 150, r: 30 });
        p.phone.drawTap(1, 636, 2244, t - (tDrop - 0.45), scroll, { w: 110, h: 110 });
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
      const p = placePhone(r.el, W / 2 + 330, H / 2, 420);
      const findings = p.phone.layer(still("lv-findings", "10-findings").src);
      const voice = p.phone.layer(still("lv-voice-note", "12-component").src);
      const tests = p.at(590, 2500, 1300);
      const mic = p.at(866, 2270, 1500);
      const cap = keyCaption(el, "Every test. Every finding. On record.");
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
            [0, on(mic, 1.4)],
            [tPop - 0.1, on(mic, 1.45)],
            [tPop + 0.5, onRight(p.at(590, 1300), 1.0)],
            [d, onRight(tests, 1.2)],
          ]),
          t,
        );
        cap(t - 1.0, d - 1.0);
      };
    }),
  );

  // 04 Prove it ------------------------------------------------------------------------
  add(
    deviceShot(17, "steel", (r) => {
      const rep = web("report-desktop");
      const b = placeBrowser(r.el, W / 2 - 120, H / 2 + 10, 1400, "sundeckpro.com/r/…");
      const l = b.browser.layer(rep.src);
      const pr1 = print(r.el, stockRef("leak-dye-light-niche").url ?? "", 1320, 140, 520, 4);
      const pr2 = print(r.el, stockRef("leak-dye-skimmer").url ?? "", 1360, 520, 520, -3);
      return (t, d) => {
        const scroll = keys(t, [
          [0, 0],
          [1.6, 0],
          [3.2, 700],
          [d, 1100],
        ]);
        l.set(scroll);
        setCam(
          r,
          camAt(t, [
            [0, on(b.at(900, 300), 1.6)],
            [1.4, on(b.at(900, 300), 1.6)],
            [2.6, { s: 1.0, x: W / 2 - 120, y: H / 2 }],
            [d, { s: 0.98, x: W / 2, y: H / 2 }],
          ]),
          t,
        );
        pr1(t, 3.9);
        pr2(t, 4.3);
      };
    }),
  );
  add(
    deviceShot(18, "steel", (r) => {
      const c = clip("08");
      const tech = placePhone(r.el, W / 2 - 330, H / 2, 400);
      const cust = placePhone(r.el, W / 2 + 330, H / 2, 400);
      const rep = web("phone-report");
      const custLayer = cust.phone.layer(rep.src);
      // The report as it lands: from "What we found" down (the customer's name stays out).
      const found = Math.max(0, (rep.boxes.found?.y ?? 2300) - 200);
      if (c) {
        const l = tech.phone.clip(c);
        return (t, d) => {
          l.set(t * Math.max(1, c.duration / d));
          custLayer.set(found);
          const s = slideIn(t, 2.6, 0.6, 1200);
          cust.phone.el.style.transform = `translate(${cust.x + s.x}px, ${cust.y}px)`;
          setCam(r, CENTER, t);
        };
      }
      const job = tech.phone.layer(still("lv-findings", "10-findings").src);
      const sign = tech.phone.sheet(still("lv-review-sign", "20-wrap-up-sign").src);
      const review = sign.at(424, 921);
      return (t) => {
        const sp = spring(t - 0.15);
        job.set(0, 1, behindSheet(sp));
        sign.set(sp);
        tech.phone.tapAt(0, review.x, review.y, t - 0.9, {
          w: 210 * sign.k * 2.5,
          h: 105 * sign.k * 1.2,
        });
        custLayer.set(flick(t, 2.9, found, found + 500, 1.4));
        const s = slideIn(t, 2.3, 0.6, 1200);
        cust.phone.el.style.transform = `translate(${cust.x + s.x}px, ${cust.y}px)`;
        setCam(
          r,
          camAt(t, [
            [0, on(tech.at(590, 900), 1.25)],
            [2.1, on(tech.at(590, 900), 1.25)],
            [2.7, CENTER],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(19, "steel", (r, el) => {
      const rep = web("phone-report");
      const p = placePhone(r.el, W / 2 + 460, H / 2, 420);
      const l = p.phone.layer(rep.src);
      const cap = keyCaption(el, "A report that looks like a big company sent it.", {
        x: 96,
        y: 780,
      });
      return (t, d) => {
        l.set(
          keys(
            t,
            [
              [0, 0],
              [d, Math.min(4200, rep.height - 2600)],
            ],
            (x) => x,
          ),
        );
        setCam(r, CENTER, t);
        cap(t - 0.8, d - 0.8);
      };
    }),
  );

  // 05 Close it on the spot ------------------------------------------------------------
  add(
    deviceShot(20, "concrete", (r) => {
      const p = placePhone(r.el, W / 2, H / 2, 420);
      const c = clip("09");
      if (c) {
        const l = p.phone.clip(c);
        return (t, d) => {
          l.set(t * Math.max(1, c.duration / d));
          setCam(r, CENTER, t);
        };
      }
      // The quote sheet over the job: tap the finding's price book line, flick to the lines.
      const job = p.phone.layer(still("lv-findings", "10-findings").src);
      const quote = p.phone.sheet(still("lv-quote", "20-wrap-up-quote").src);
      return (t, d) => {
        const sp = spring(t - 0.1);
        job.set(0, 1, behindSheet(sp));
        const scroll = flick(t, 2.3, 0, 620, 1.2);
        quote.set(sp, scroll);
        const chip = quote.at(519, 921, scroll);
        p.phone.tapAt(0, chip.x, chip.y, t - 0.75, { w: 470 * quote.k, h: 80 * quote.k });
        const lines = quote.at(590, 1300, 620);
        setCam(
          r,
          camAt(t, [
            [0, { s: 1, x: W / 2, y: H / 2 }],
            [1.0, on({ x: p.x + p.phone.bezel + chip.x, y: p.y + p.phone.bezel + chip.y }, 1.45)],
            [2.2, on({ x: p.x + p.phone.bezel + chip.x, y: p.y + p.phone.bezel + chip.y }, 1.45)],
            [d, on({ x: p.x + p.phone.bezel + lines.x, y: p.y + p.phone.bezel + lines.y }, 1.3)],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(21, "concrete", (r) => {
      // The customer's own phone: her quote scrolls to its totals and Accept This Quote, then the
      // same page once she accepted, with the deposit received. No taps: the open capture has the
      // terms switch off, and tapping Accept Quote with it off would not accept.
      const open = web("phone-quote-open");
      const done = web("phone-quote-accepted");
      const p = placePhone(r.el, W / 2, H / 2, 420);
      const l1 = p.phone.layer(open.src);
      const l2 = p.phone.layer(done.src);
      // Scrolled to Accept This Quote, never past the page's end.
      const top1 = Math.min(open.height - 2600, Math.max(0, (open.boxes.heading?.y ?? 2400) - 220));
      const top2 = Math.min(done.height - 2600, Math.max(0, (done.boxes.heading?.y ?? 1300) - 220));
      return (t) => {
        const scroll = flick(t, 0.1, top1 - 500, top1, 0.9);
        const swap = ramp(t, 2.4, 2.75);
        l1.set(scroll, 1 - swap);
        l2.set(top2, swap);
        setCam(
          r,
          camAt(t, [
            [0, { s: 1.12, x: W / 2, y: H / 2 + 60 }],
            [4.0, { s: 1.18, x: W / 2, y: H / 2 + 40 }],
          ]),
          t,
        );
      };
    }),
  );
  add(
    shot(22, (el) => {
      const p = photo(el, photoRef("07"), [1.03, 50, 50], [1.1, 50, 45], 0.55);
      const a = slamText(el, ["No callbacks."], { size: 130, x: 110, y: 170 });
      const b = slamText(el, ["No “let me think", "about it.”"], { size: 130, x: 110, y: 310 });
      const c = slamText(el, ["Done."], { size: 230, x: 110, y: 570, accent: ["Done"] });
      const cap = keyCaption(el, "They say yes before you leave.");
      return (t, d) => {
        p(t, d);
        a.draw(t, spread(2, 0.1, 0.4));
        b.draw(t, spread(b.words, 1.0, 2.1));
        c.draw(t, [2.95]);
        const k = shake(t, 2.95, 10);
        c.box.style.transform = `translate(${k.x}px, ${k.y}px)`;
        cap(t - 3.4, d - 3.4);
      };
    }),
  );

  // 06 Every pool, every week -----------------------------------------------------------
  add(
    deviceShot(23, "steel", (r, el) => {
      const pool = div("fill", el);
      const pp = photo(pool, photoRef("06"), [1.03, 50, 50], [1.1, 50, 50], 0.1);
      pool.style.zIndex = "5";
      const week = web("week");
      const b = placeBrowser(r.el, W / 2, H / 2 + 10, 1500);
      const l = b.browser.layer(week.src);
      const target = Math.min(1500, week.height - 1800);
      return (t, d) => {
        pp(t, 1.5);
        pool.style.display = t < 1.5 ? "" : "none";
        l.set(
          keys(t, [
            [1.5, target * 0.6],
            [d, target],
          ]),
        );
        setCam(
          r,
          camAt(t, [
            [1.5, { s: 1.0, x: W / 2, y: H / 2 }],
            [d, { s: 1.08, x: W / 2 + 60, y: H / 2 + 20 }],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(24, "concrete", (r) => {
      const p = placePhone(r.el, W / 2, H / 2, 420);
      const c = clip("10");
      if (c) {
        const l = p.phone.clip(c);
        return (t, d) => {
          l.set(t * Math.max(1, (c.duration * 0.5) / d));
          setCam(r, CENTER, t);
        };
      }
      // Today → the pool stop pushes in → Chemical → What to Add comes up as a sheet.
      const today = p.phone.layer(still("lv-today-pool", "30-today-cleanings").src);
      const visit = p.phone.layer(still("lv-cleanings", "30-checklist-cleanings").src);
      const add = p.phone.sheet(still("lv-what-to-add", "47-chemicals-doses").src);
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
            [0, CENTER],
            [tSheet + 0.3, CENTER],
            [tSheet + 0.9, on(focus, 1.5)],
            [d, on(focus, 1.58)],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(25, "concrete", (r) => {
      const p = placePhone(r.el, W / 2 - 280, H / 2, 420);
      const c = clip("10");
      const before = print(r.el, stockRef("pool-before").url ?? "", W / 2 + 40, 160, 560, -3);
      const after = print(r.el, stockRef("pool-after").url ?? "", W / 2 + 120, 480, 560, 3);
      if (c) {
        const l = p.phone.clip(c);
        return (t, d) => {
          l.set(c.duration * 0.5 + t * Math.max(1, (c.duration * 0.5) / d));
          before(t, 2.0);
          after(t, 2.8);
          setCam(r, CENTER, t);
        };
      }
      const l = p.phone.layer(still("lv-cleanings", "30-checklist-cleanings").src);
      const filter = p.at(590, 1528);
      return (t, d) => {
        l.set(0);
        before(t, 2.0);
        after(t, 2.7);
        p.phone.drawTap(0, 707, 794, t - (d - 1.6), 0, { w: 330, h: 105 });
        setCam(
          r,
          camAt(t, [
            [0, on(filter, 1.45)],
            [1.6, on(filter, 1.45)],
            [2.2, { s: 1, x: W / 2, y: H / 2 }],
            [d - 1.4, { s: 1, x: W / 2, y: H / 2 }],
            [d - 0.9, on(p.at(707, 794), 1.4)],
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
      const p = placePhone(r.el, W / 2 + 420, H / 2, 420, { status: "light" });
      const l = p.phone.layer(rep.src);
      const end = Math.max(0, rep.height - 2600);
      const cap = keyCaption(el, "Your route runs itself.");
      return (t, d) => {
        yp(t, d);
        const scroll = flick(t, 3.4, flick(t, 1.0, 0, end * 0.45, 1.2), end, 1.3);
        l.set(scroll);
        p.phone.statusBar(scroll > 500 ? "dark" : "light", "7:42");
        setCam(r, CENTER, t, 3);
        cap(t - 2.0, d - 2.0);
      };
    }),
  );

  // 07 Spot the upsell -----------------------------------------------------------------
  add(
    deviceShot(27, "concrete", (r, el) => {
      const pad = div("fill", el);
      const pp = photo(pad, stockRef("equipment-pad"), [1.03, 40, 60], [1.15, 30, 65], 0.1);
      pad.style.zIndex = "5";
      const p = placePhone(r.el, W / 2, H / 2, 420);
      const c = clip("11");
      const cap = keyCaption(el, "Every visit can be a sale.");
      if (c) {
        const l = p.phone.clip(c);
        return (t, d) => {
          pp(t, 2.6);
          pad.style.display = t < 2.6 ? "" : "none";
          l.set((t - 2.6) * Math.max(1, c.duration / (d - 2.6)));
          setCam(r, CENTER, t);
          cap(t - 5.6, d - 5.6);
        };
      }
      // The finding as a sheet over the visit, then (dismissed) the quote from it.
      const visit = p.phone.layer(still("lv-cleanings", "30-checklist-cleanings").src);
      const finding = p.phone.sheet(still("lv-pump-finding", "14-finding-editor").src);
      const quote = p.phone.sheet(still("lv-pump-quote", "lv-quote", "20-wrap-up-quote").src);
      return (t, d) => {
        pp(t, 2.6);
        pad.style.display = t < 2.6 ? "" : "none";
        const f = spring(t - 2.7) * (1 - spring(t - 4.9, 0.35));
        const q = spring(t - 5.25);
        visit.set(0, 1, behindSheet(Math.max(f, q)));
        finding.set(f);
        quote.set(q);
        setCam(
          r,
          camAt(t, [
            [2.6, { s: 1.04, x: W / 2, y: H / 2 }],
            [d, { s: 1.1, x: W / 2, y: H / 2 }],
          ]),
          t,
        );
        cap(t - 5.6, d - 5.6);
      };
    }),
  );

  // 08 Get paid ------------------------------------------------------------------------
  add(
    deviceShot(28, "steel", (r) => {
      const inv = web("vs-invoices");
      const pay = web("phone-invoice-open");
      const b = placeBrowser(r.el, 760, H / 2 + 20, 1260);
      const bl = b.browser.layer(inv.src);
      const p = placePhone(r.el, 1560, H / 2, 380, { status: "light" });
      const pl = p.phone.layer(pay.src);
      return (t, d) => {
        bl.set(0);
        pl.set(
          keys(t, [
            [0, 0],
            [d, Math.max(0, pay.height - 2600)],
          ]),
        );
        const s = slideIn(t, 1.4, 0.6, 900);
        p.phone.el.style.transform = `translate(${p.x + s.x}px, ${p.y}px)`;
        setCam(
          r,
          camAt(t, [
            [0, { s: 1.05, x: W / 2 - 100, y: H / 2 }],
            [d, { s: 1, x: W / 2, y: H / 2 }],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(29, "concrete", (r) => {
      const p = placePhone(r.el, W / 2, H / 2, 420);
      const c = clip("12");
      if (c) {
        const l = p.phone.clip(c);
        return (t, d) => {
          l.set(t * Math.max(1, c.duration / d));
          setCam(r, CENTER, t);
        };
      }
      // Record Payment as a sheet over the job; after it, Send Receipt.
      const job = p.phone.layer(still("lv-findings", "10-findings").src);
      const pay = p.phone.sheet(still("lv-record-payment", "81-record-payment").src);
      const receiptStill = still("lv-send-receipt", "81-send-receipt-text");
      const receipt = p.phone.sheet(receiptStill.src);
      const sendY = receiptStill.src.includes("lv-") ? 1204 : 1353;
      const record = pay.at(580, 1200);
      const send = receipt.at(580, sendY);
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
            [0, on(p.at(590, 1000), 1.3)],
            [4.5, on(p.at(590, 1150), 1.34)],
          ]),
          t,
        );
      };
    }),
  );
  add(
    deviceShot(30, "steel", (r, el) => {
      const dash = web("vs-dashboard");
      const b = placeBrowser(r.el, W / 2, H / 2 + 10, 1500);
      const l = b.browser.layer(dash.src);
      const col = mid(dash.boxes.collected, { x: 1300, y: 420 });
      const cnt = counter(el, "Collected · 6 months", 10991500, 110, 160);
      const cap = keyCaption(el, "Stop chasing checks.");
      return (t, d) => {
        l.set(0);
        setCam(
          r,
          camAt(t, [
            [0, { s: 1, x: W / 2, y: H / 2 }],
            [1.0, on(b.at(col.x + 300, col.y + 60), 1.7)],
            [d, on(b.at(col.x + 300, col.y + 60), 1.8)],
          ]),
          t,
        );
        cnt(t, 0.9);
        cap(t - 2.4, d - 2.4);
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
        l.set(
          keys(t, [
            [0, 0],
            [d, 300],
          ]),
        );
        setCam(
          r,
          camAt(t, [
            [0, { s: 0.92, x: W / 2, y: H / 2 }],
            [d, { s: 1.0, x: W / 2, y: H / 2 }],
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
      // What came in, what's still owed, what was billed, who said yes.
      const collected = pt("collected", { x: 1300, y: 420 });
      const owed = pt("owed", { x: 2200, y: 420 });
      const invoiced = pt("invoiced", { x: 1300, y: 720 });
      const quotes = pt("quotes", { x: 400, y: 720 });
      return (t, d) => {
        l.set(0);
        setCam(
          r,
          camAt(
            t,
            [
              [0, on(collected, 1.9)],
              [1.3, on(collected, 1.9)],
              [1.75, on(owed, 1.9)],
              [2.9, on(owed, 1.9)],
              [3.35, on(invoiced, 1.9)],
              [4.2, on(invoiced, 1.9)],
              [4.65, on(quotes, 1.9)],
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
      // The shop's Activity: payments and accepted quotes as they came in from every truck.
      const act = web("vs-activity");
      const b = placeBrowser(r.el, W / 2, H / 2 + 10, 1500);
      const l = b.browser.layer(act.src);
      const row = act.boxes.payment ?? act.boxes.quoteAccepted;
      const scroll = Math.max(0, (row?.y ?? 700) - 260);
      // The list's column: from its left edge, about a thousand pixels wide.
      const focus = b.at((row?.x ?? 320) + 520, (row?.y ?? 700) + 380, scroll);
      const cap = keyCaption(el, "Every truck. Every job. Every dollar. One screen.");
      return (t, d) => {
        l.set(flick(t, 0.2, scroll - 500, scroll, 1.2));
        setCam(
          r,
          camAt(t, [
            [0, onRight(focus, 1.25)],
            [d, onRight(focus, 1.4)],
          ]),
          t,
        );
        cap(t - 1.8, d - 1.8);
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
            [1.8, on(b.at(subject.x + 200, subject.y + 120), 1.45)],
            [d - 2.4, on(b.at(subject.x + 200, subject.y + 300), 1.45)],
            [d - 1.6, on(b.at(send.x + 420, send.y - 180), 1.45)],
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
      const cap = keyCaption(el, "Customers who come back. And send their friends.");
      return (t, d) => {
        l.set(0);
        setCam(
          r,
          camAt(t, [
            [0, { s: 1, x: W / 2, y: H / 2 }],
            [1.6, onRight(b.at(1500, 850), 1.5)],
            [d, onRight(b.at(1500, 850), 1.56)],
          ]),
          t,
        );
        cap(t - 2.6, d - 2.6);
      };
    }),
  );

  // 11 Built for the backyard -----------------------------------------------------------
  add(
    deviceShot(36, "concrete", (r, el) => {
      // In the backyard at six in the morning: Today in dark mode, Start under the thumb.
      const yard = div("fill", r.el);
      const yp = photo(yard, photoRef("06"), [1.04, 50, 50], [1.1, 50, 48], 0.3);
      const p = placePhone(r.el, W / 2 + 420, H / 2, 420, {
        status: "light",
        time: "6:04",
        dark: true,
      });
      const c = clip("13");
      const cap = keyCaption(el, "No signal? No problem.");
      const dark = still("lv-today-dark", "30-today-dark");
      const l = c ? p.phone.clip(c) : p.phone.layer(dark.src);
      const y = dark.src.includes("lv-") ? 1534 : 1660;
      return (t, d) => {
        yp(t, d);
        if ("clip" in l) l.set(t * Math.max(1, l.clip.duration / d));
        else {
          l.set(0);
          p.phone.drawTap(0, 352, y, t - 3.0, 0, { w: 520, h: 150 });
        }
        setCam(
          r,
          camAt(t, [
            [0, CENTER],
            [d, { s: 1.05, x: W / 2 + 60, y: H / 2 }],
          ]),
          t,
          3,
        );
        cap(t - 1.2, d - 1.2);
      };
    }),
  );
  add(
    deviceShot(37, "concrete", (r) => {
      // Big buttons, one hand: the card's Start and the round Text, Call and Directions buttons.
      const p = placePhone(r.el, W / 2, H / 2, 420);
      const c = clip("14");
      if (c) {
        const l = p.phone.clip(c);
        return (t, d) => {
          l.set(t * Math.max(1, c.duration / d));
          setCam(r, CENTER, t);
        };
      }
      const today = still("lv-today", "30-today");
      const l = p.phone.layer(today.src);
      const y = today.src.includes("lv-") ? 1534 : 1660;
      return (t, d) => {
        l.set(0);
        p.phone.drawTap(0, 352, y, t - 0.9, 0, { w: 520, h: 150 });
        p.phone.drawTap(1, 1018, y, t - 2.2, 0, { w: 150, h: 150 });
        setCam(
          r,
          camAt(t, [
            [0, CENTER],
            [0.8, on(p.at(640, y), 1.55)],
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
      const t3 = slamText(el, ["A bigger name in town."], { size: 170, x: 110, y: 720 });
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
      const t2 = slamText(el, ["Saturdays at the lake."], { size: 170, x: 110, y: 720 });
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
        text.draw(t, spread(text.words, 1.0, 2.6));
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
