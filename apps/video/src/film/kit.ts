// The film's building blocks: backgrounds, photos (or their labeled placeholders), big slammed
// type, chapter cards, captions and the camera rig that floats and pushes in on the devices.

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
} from "./engine.ts";
import { pending } from "./devices.ts";
import { textures } from "./look.ts";

// ---------------------------------------------------------------------------
// Backgrounds
// ---------------------------------------------------------------------------

export type Surface = "concrete" | "concreteLight" | "steel" | "navy" | "black";

/** A full-frame surface that drifts a little, with a hard band of light across it. */
export function surface(parent: HTMLElement, kind: Surface, light = true) {
  const el = div("bg", parent);
  if (kind === "navy") css(el, { background: "var(--navy)" });
  else if (kind === "black") css(el, { background: "#000" });
  else css(el, { "background-image": `url(${textures[kind]})` });
  // Hard light: a sharp-edged slab of sun through a doorway, not a soft glow.
  const band = div("fill", parent);
  css(band, {
    background:
      kind === "steel" || kind === "navy" ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.09)",
    display: light && kind !== "black" ? "" : "none",
  });
  return (t: number) => {
    el.style.transform = `translate(${-t * 4}px, ${-t * 1.5}px)`;
    const x = 640 + t * 14;
    band.style.clipPath = `polygon(${x}px 0, ${x + 520}px 0, ${x + 140}px ${H}px, ${x - 380}px ${H}px)`;
  };
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export interface PhotoRef {
  /** The file to use, when it exists. */
  url: string | null;
  /** "PHOTO 3: kitchen table at night" for the placeholder card. */
  label: string;
  /** Where to drop the file, for the placeholder card. */
  file: string;
}

/**
 * A full-frame photo with a slow push (and pan), or a dark placeholder card naming the photo to
 * make. `from`/`to` are [scale, x%, y%].
 */
export function photo(
  parent: HTMLElement,
  ref: PhotoRef,
  from: [number, number, number] = [1.04, 50, 50],
  to: [number, number, number] = [1.12, 50, 46],
  shade = 0,
  /** The push's pace: eased in and out, or `(x) => x` for a constant speed (fast cuts). */
  ease: (x: number) => number = easeInOut,
) {
  const wrap = div("fill", parent);
  css(wrap, { overflow: "hidden", background: "var(--n900)" });
  let el: HTMLElement;
  if (ref.url) {
    el = img(ref.url, wrap, "fill");
    // A new scene's photo is decoded before its first frame is taken, never a blank frame.
    pending.push((el as HTMLImageElement).decode().catch(() => {}));
    css(el, {
      width: W,
      height: H,
      "object-fit": "cover",
      filter: "contrast(1.06) saturate(0.92)",
    });
  } else {
    el = div("fill", wrap);
    css(el, { "background-image": `url(${textures.steel})`, "background-size": "cover" });
    const card = div("", el);
    css(card, {
      position: "absolute",
      left: 120,
      top: 120,
      right: 120,
      bottom: 120,
      border: "3px dashed var(--n500)",
      "border-radius": 18,
      display: "flex",
      "flex-direction": "column",
      "justify-content": "center",
      "align-items": "center",
      gap: "18px",
    });
    const title = div("display", card, ref.label);
    css(title, {
      "font-size": 76,
      color: "var(--n300)",
      "text-align": "center",
      padding: "0 80px",
    });
    const file = div("", card, `Placeholder. Drop the photo at apps/video/${ref.file}`);
    css(file, { font: "500 28px 'Public Sans', sans-serif", color: "var(--n400)" });
  }
  const dark = div("fill", wrap);
  css(dark, { background: "var(--navy)", opacity: shade });
  // Film grain on photos only (never over the app's screens), a new pattern 15 times a second.
  const grain = div("grain", wrap);
  css(grain, { opacity: 0.06 });
  return (t: number, d: number) => {
    grain.style.backgroundImage = `url(${textures.grain[Math.floor(Math.max(0, t) * 15) % textures.grain.length]})`;
    const p = ease(clamp(t / Math.max(d, 0.01)));
    const s = lerp(from[0], to[0], p);
    const x = lerp(from[1], to[1], p);
    const y = lerp(from[2], to[2], p);
    el.style.transformOrigin = `${x}% ${y}%`;
    el.style.transform = `scale(${s})`;
  };
}

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

export interface SlamOptions {
  size?: number;
  color?: string;
  /** Left edge or centered. */
  align?: "left" | "center";
  x?: number;
  y?: number;
  /** Words to underline in safety orange (one per screen at most; never a blue word on a photo). */
  accent?: string[];
  width?: number;
}

/**
 * Big condensed type that slams in word by word. `lines` are rows of text; `times` gives each
 * word's entrance (seconds from the scene's start), or the words share `from`–`to` evenly.
 */
export function slamText(parent: HTMLElement, lines: string[], o: SlamOptions = {}) {
  const size = o.size ?? 150;
  const box = div("display", parent);
  css(box, {
    position: "absolute",
    left: o.align === "center" ? 0 : (o.x ?? 120),
    width: o.align === "center" ? W : (o.width ?? W - 240),
    top: o.y ?? H / 2 - (lines.length * size * 0.95) / 2,
    "font-size": size,
    color: o.color ?? "var(--paper)",
    "text-align": o.align ?? "left",
    // Legible over any photo: a soft dark halo under the white type.
    "text-shadow": "0 3px 0 rgba(0,0,0,0.35), 0 0 36px rgba(0,0,0,0.55), 0 0 12px rgba(0,0,0,0.35)",
  });
  const words: HTMLElement[] = [];
  for (const line of lines) {
    const row = div("", box);
    line.split(" ").forEach((w, i) => {
      const span = document.createElement("span");
      span.className = "word";
      span.textContent = (i ? " " : "") + w;
      if (o.accent?.some((a) => w.toUpperCase().startsWith(a.toUpperCase()))) {
        span.style.textDecoration = "underline";
        span.style.textDecorationColor = "var(--safety)";
        span.style.textDecorationThickness = "0.07em";
        span.style.textUnderlineOffset = "0.1em";
      }
      row.appendChild(span);
      words.push(span);
    });
  }
  return {
    words: words.length,
    box,
    draw(t: number, times: number[], out = Infinity) {
      words.forEach((w, i) => {
        const p = ramp(t, times[i] ?? 0, (times[i] ?? 0) + 0.2);
        const s = lerp(1.45, 1, slam(p));
        // Full white within two frames (never a grey, half-faded word on screen).
        const on = ramp(t, times[i] ?? 0, (times[i] ?? 0) + 1.5 / 60);
        w.style.opacity = String(on * (1 - ramp(t, out, out + 0.15)));
        w.style.transform = `scale(${s})`;
      });
    },
  };
}

/** Even times for `n` words between two moments. */
export const spread = (n: number, from: number, to: number) =>
  Array.from({ length: n }, (_, i) => (n === 1 ? from : lerp(from, to, i / (n - 1))));

/** Small caps-style label in Barlow (a kicker or a time stamp). */
export function label(parent: HTMLElement, text: string, styles: Record<string, string | number>) {
  const el = div("display", parent, text);
  css(el, styles);
  return el;
}

/** The chapter card: "01 / DISPATCH", the number in safety orange, painted through a stencil. */
export function chapterCard(parent: HTMLElement, number: string, title: string) {
  const draw = surface(parent, "steel", false);
  const row = div("display", parent);
  css(row, {
    position: "absolute",
    left: 150,
    top: H / 2 - 150,
    display: "flex",
    "align-items": "baseline",
    gap: "36px",
    "white-space": "nowrap",
  });
  const num = div("", row, number);
  css(num, {
    "font-size": 300,
    color: "var(--safety)",
    "-webkit-mask-image": `url(${textures.stencil})`,
    "-webkit-mask-size": "640px 360px",
    "mask-mode": "luminance",
  });
  const slash = div("", row, "/");
  css(slash, { "font-size": 200, color: "var(--n500)" });
  const name = div("", row, title.toUpperCase());
  css(name, {
    "font-size": Math.min(150, Math.floor(1150 / (title.length * 0.53))),
    color: "var(--paper)",
  });
  const rule = div("abs", parent);
  css(rule, { left: 150, top: H / 2 + 150, height: 6, background: "var(--water)" });
  return (t: number, d: number) => {
    draw(t);
    const pn = expoOut(ramp(t, 0, 0.35));
    num.style.transform = `translateY(${(1 - pn) * 120}px) scale(${lerp(1.3, 1, slam(ramp(t, 0, 0.3)))})`;
    // On screen from the first frame (no empty card), slamming down to size.
    num.style.opacity = "1";
    slash.style.opacity = String(ramp(t, 0, 0.12));
    // The title is whole from its first frame (never half-written): it slides in as one.
    const pt = expoOut(ramp(t, 0.05, 0.4));
    name.style.opacity = String(clamp(pt * 4));
    name.style.transform = `translateX(${(1 - pt) * 50}px)`;
    rule.style.width = `${easeOut(ramp(t, 0.1, 0.7)) * 1100}px`;
    // A push out as it leaves.
    const out = ramp(t, d - 0.15, d);
    row.style.transform = `translateX(${-out * 60}px)`;
    row.style.opacity = String(1 - out);
    rule.style.opacity = String(1 - out);
  };
}

/**
 * A key line that stays on screen for muted viewing: white on a solid navy bar, left-aligned,
 * broken where the text has "\n". It sits in the caption zone (bottom left, or bottom right
 * with `side: "right"`), and shots keep their devices out of that zone while it shows.
 */
export function keyCaption(
  parent: HTMLElement,
  text: string,
  opts: { y?: number; x?: number; side?: "left" | "right" } = {},
) {
  const el = div("display", parent);
  const side = opts.side ?? "left";
  css(el, {
    position: "absolute",
    ...(side === "right" ? { right: opts.x ?? 96 } : { left: opts.x ?? 96 }),
    ...(opts.y === undefined ? { bottom: 110 } : { top: opts.y }),
    padding: "18px 30px 14px 30px",
    "font-size": 64,
    background: "var(--navy)",
    color: "var(--paper)",
    "border-left": "10px solid var(--water)",
    "line-height": "1",
    "white-space": "pre",
    "text-align": "left",
    "z-index": 8,
  });
  el.textContent = text.toUpperCase();
  return (t: number, d: number) => {
    const p = easeOut(ramp(t, 0, 0.3));
    el.style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
    el.style.opacity = String(1 - ramp(t, d - 0.2, d));
  };
}

/** The caption zone's right edge (left captions): devices stay right of it while one shows. */
export const CAPTION_RIGHT = 1000;

/** The narration as a subtitle (placeholder cut only, to judge pacing). */
export function subtitle(parent: HTMLElement, text: string) {
  const el = div("", parent, text);
  css(el, {
    position: "absolute",
    left: 260,
    width: W - 520,
    bottom: 54,
    "text-align": "center",
    font: "600 30px/1.3 'Public Sans', sans-serif",
    color: "var(--paper)",
  });
  const inner = el;
  inner.style.textShadow = "0 2px 0 rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.9)";
  return (t: number) => {
    el.style.opacity = String(ramp(t, 0, 0.12));
  };
}

// ---------------------------------------------------------------------------
// The camera rig
// ---------------------------------------------------------------------------

export interface Cam {
  /** Zoom. */
  s: number;
  /** The point of the rig (stage pixels at zoom 1) shown at the frame's center. */
  x: number;
  y: number;
}

/** A layer the camera moves: devices sit in it at stage coordinates. */
export function rig(parent: HTMLElement) {
  // The lens: a rounded window the devices show through, for a push-in that leaves room for a
  // caption (the frame's left part shows the surface under it, never a device under the type).
  const shadow = div("abs", parent);
  css(shadow, { "border-radius": 28, "box-shadow": "0 30px 70px rgba(0,0,0,0.42)", opacity: 0 });
  const frame = div("fill", parent);
  const el = div("abs", frame);
  css(el, { width: W, height: H });
  return {
    el,
    set(c: Cam, rot = 0) {
      const tx = W / 2 - c.x * c.s;
      const ty = H / 2 - c.y * c.s;
      el.style.transform = `translate(${tx}px, ${ty}px) scale(${c.s})${rot ? ` rotate(${rot}deg)` : ""}`;
    },
    /**
     * Narrows the view to a window right of the caption zone (`side: "right"`) or left of a
     * right-hand caption, by `p` (0 full frame, 1 the window).
     */
    lens(p: number, side: "right" | "left" = "right") {
      const q = easeInOut(clamp(p));
      if (q <= 0) {
        frame.style.clipPath = "";
        shadow.style.opacity = "0";
        return;
      }
      const edge = 60 * q;
      const inner = (CAPTION_RIGHT + 40) * q;
      const [l, r] = side === "right" ? [inner, edge] : [edge, inner];
      frame.style.clipPath = `inset(${edge}px ${r}px ${edge}px ${l}px round ${28 * q}px)`;
      css(shadow, { left: l, top: edge, width: W - l - r, height: H - 2 * edge, opacity: q });
    },
  };
}

/** Camera keyframes: [time, cam] eased between. */
export function camAt(t: number, frames: [number, Cam][], ease = easeInOut): Cam {
  return {
    s: keys(
      t,
      frames.map(([k, c]) => [k, c.s]),
      ease,
    ),
    x: keys(
      t,
      frames.map(([k, c]) => [k, c.x]),
      ease,
    ),
    y: keys(
      t,
      frames.map(([k, c]) => [k, c.y]),
      ease,
    ),
  };
}

/** A device's float: a slow drift so nothing on screen is ever dead still. */
export const float = (t: number, amount = 6) => ({
  x: Math.sin(t * 0.7) * amount,
  y: Math.cos(t * 0.55) * amount * 0.8,
});

/** A short shake for slams (frames after a hit). */
export function shake(t: number, at: number, amount = 14) {
  const p = ramp(t, at, at + 0.35);
  if (p <= 0 || p >= 1) return { x: 0, y: 0 };
  const k = (1 - p) * amount;
  return { x: Math.sin(t * 90) * k, y: Math.cos(t * 77) * k * 0.7 };
}

/** A sheet that slides in from the right (a print, a second phone). */
export function slideIn(t: number, at: number, dur = 0.5, dist = 900) {
  const p = expoOut(ramp(t, at, at + dur));
  return { x: (1 - p) * dist, o: clamp(p * 4) };
}
