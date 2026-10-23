// The two devices the film shows: the iPhone (the tech's side, the app's real screens) and a
// desktop browser window (the owner's side, the website's real screens). Each holds layers of
// screenshots, moved only the way iOS moves a screen: momentum scrolling, pushes from the right,
// sheets sliding up over a screen that steps back, taps that press the control first.

import { clamp, css, div, easeOut, img, ramp } from "./engine.ts";

/** Image decodes started by this frame; the frame waits for them before it's captured. */
export const pending: Promise<unknown>[] = [];

// ---------------------------------------------------------------------------
// iOS motion
// ---------------------------------------------------------------------------

/**
 * A critically damped spring (UIKit's default for pushes and sheets): no overshoot, settled
 * by about `response` seconds. 0 → 1 from t = 0.
 */
export function spring(t: number, response = 0.45) {
  if (t <= 0) return 0;
  const w = (2 * Math.PI) / response;
  return Math.min(1, 1 - (1 + w * t) * Math.exp(-w * t));
}

/** A flick's deceleration: fast at first, easing to rest over `dur` seconds. */
export function glide(t: number, t0: number, dur = 1.1) {
  const u = clamp((t - t0) / dur);
  return (1 - Math.exp(-5 * u)) / (1 - Math.exp(-5));
}

/** A scroll by momentum from `from` to `to`, flicked at `t0`. */
export const flick = (t: number, t0: number, from: number, to: number, dur = 1.1) =>
  from + (to - from) * glide(t, t0, dur);

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

export interface LayerStyle {
  /** Slid sideways, in screen pixels (pushes). */
  dx?: number;
  /** Stepped back (a sheet over it): scale about the screen's top center. */
  scale?: number;
  /** Darkened, 0 to 1. */
  dim?: number;
  /** Moved down, in screen pixels. */
  dy?: number;
}

/** A screenshot inside a device: scrolled by `scroll` image pixels, at an opacity. */
export class Layer {
  el: HTMLImageElement;
  k: number;
  w: number;
  constructor(parent: HTMLElement, src: string, k: number, width: number) {
    this.k = k;
    this.w = width;
    this.el = img(src, parent, "abs");
    css(this.el, { width });
    pending.push(this.el.decode().catch(() => {}));
  }
  set(scroll: number, opacity = 1, style: LayerStyle = {}) {
    const y = -scroll * this.k + (style.dy ?? 0);
    const s = style.scale ?? 1;
    this.el.style.transformOrigin = `${this.w / 2}px ${scroll * this.k}px`;
    this.el.style.transform = `translate(${style.dx ?? 0}px, ${y}px)${s !== 1 ? ` scale(${s})` : ""}`;
    this.el.style.filter = style.dim ? `brightness(${1 - style.dim})` : "";
    this.el.style.opacity = String(opacity);
    this.el.style.display = opacity <= 0 ? "none" : "";
  }
}

/**
 * A screen recording inside a device, as frames extracted ahead of time (render.ts): shows the
 * frame for a time in the clip, so frames render in any order.
 */
export class ClipLayer {
  el: HTMLImageElement;
  k: number;
  clip: Clip;
  private src = "";
  private top: number;
  constructor(parent: HTMLElement, clip: Clip, width: number, top = 0) {
    this.clip = clip;
    this.k = width / clip.width;
    this.top = top;
    this.el = img(clip.frame(1), parent, "abs");
    this.src = this.el.src;
    css(this.el, { width });
    pending.push(this.el.decode().catch(() => {}));
  }
  /** Shows the clip at `time` seconds (held on its first and last frames outside). */
  set(time: number, opacity = 1, scroll = 0) {
    const i = Math.min(this.clip.frames, Math.max(1, Math.round(time * this.clip.fps) + 1));
    const src = this.clip.frame(i);
    if (src !== this.src) {
      this.src = src;
      this.el.src = src;
      pending.push(this.el.decode().catch(() => {}));
    }
    this.el.style.transform = `translateY(${this.top - scroll * this.k}px)`;
    this.el.style.opacity = String(opacity);
    this.el.style.display = opacity <= 0 ? "none" : "";
  }
}

export interface Clip {
  frames: number;
  fps: number;
  /** The extracted frames' size. */
  width: number;
  height: number;
  duration: number;
  frame: (i: number) => string;
}

/**
 * A sheet screen (the app's form sheets) sliding up over the screen: rounded top corners, its
 * own status-bar strip left out, so its bar sits at the sheet's top as on an iPhone.
 */
export class Sheet {
  wrap: HTMLDivElement;
  el: HTMLImageElement;
  k: number;
  top: number;
  h: number;
  /** The status bar's height in the screenshot's pixels (54 pt at 3×). */
  cut: number;
  constructor(phone: Phone, src: string, srcWidth = 1179) {
    this.k = phone.w / srcWidth;
    this.cut = (162 * srcWidth) / 1179;
    this.top = phone.h * 0.068;
    this.h = phone.h;
    this.wrap = div("abs", phone.screen);
    css(this.wrap, {
      width: phone.w,
      height: phone.h,
      overflow: "hidden",
      "border-radius": `${phone.w * 0.045}px ${phone.w * 0.045}px 0 0`,
      background: "var(--app-bg)",
    });
    this.el = img(src, this.wrap, "abs");
    css(this.el, { width: phone.w });
    pending.push(this.el.decode().catch(() => {}));
    phone.screen.insertBefore(this.wrap, phone.status);
  }
  /** `p` 0 (off screen) → 1 (up), scrolled by `scroll` image pixels. */
  set(p: number, scroll = 0, opacity = 1) {
    this.wrap.style.display = p <= 0 || opacity <= 0 ? "none" : "";
    this.wrap.style.transform = `translateY(${this.top + (1 - p) * (this.h - this.top + 20)}px)`;
    this.wrap.style.opacity = String(opacity);
    this.el.style.transform = `translateY(${-(this.cut + scroll) * this.k}px)`;
  }
  /** A point on the sheet (screenshot pixels) in the screen's pixels, when it's up. */
  at(px: number, py: number, scroll = 0) {
    return { x: px * this.k, y: this.top + (py - this.cut - scroll) * this.k };
  }
}

/** The look of the screen behind a sheet as it comes up: stepped back and darkened. */
export const behindSheet = (p: number): LayerStyle => ({
  scale: 1 - 0.07 * p,
  dim: 0.28 * p,
  dy: 8 * p,
});

/** A push: the new screen from the right, the old one drifting left a third and dimming. */
export function push(p: number, w: number): { from: LayerStyle; to: LayerStyle } {
  return { from: { dx: -0.3 * w * p, dim: 0.12 * p }, to: { dx: w * (1 - p) } };
}

// ---------------------------------------------------------------------------
// Taps
// ---------------------------------------------------------------------------

/** A tap: a ring a beat before, then the control pressed (dimmed) as the finger lands. */
export class Tap {
  ring: HTMLDivElement;
  press: HTMLDivElement;
  constructor(parent: HTMLElement, size: number) {
    this.press = div("abs", parent);
    this.ring = div("abs", parent);
    css(this.ring, {
      width: size,
      height: size,
      "border-radius": "50%",
      border: `${Math.max(3, size * 0.06)}px solid var(--paper)`,
      "box-shadow": "0 0 0 2px rgba(18, 38, 58, 0.35)",
    });
    css(this.press, { background: "#000" });
  }
  /**
   * Draws the tap at (x, y) in its parent's pixels; `t` seconds since the ring appeared. The
   * finger lands at 0.45 s; `pressed` is the control's size, dimmed while it's held.
   */
  draw(
    x: number,
    y: number,
    t: number,
    size: number,
    pressed?: { w: number; h: number; r?: number },
  ) {
    const show = t >= 0 && t < 1.1;
    this.ring.style.display = show ? "" : "none";
    this.press.style.display = show && pressed ? "" : "none";
    if (!show) return;
    const close = easeOut(ramp(t, 0, 0.45));
    const s = 1.8 - 0.8 * close;
    const fade = 1 - ramp(t, 0.6, 1.1);
    this.ring.style.transform = `translate(${x - (size * s) / 2}px, ${y - (size * s) / 2}px) scale(${s})`;
    this.ring.style.opacity = String(Math.min(close * 1.4, 1) * fade);
    if (pressed) {
      const held = ramp(t, 0.42, 0.48) * (1 - ramp(t, 0.66, 0.86));
      css(this.press, {
        left: x - pressed.w / 2,
        top: y - pressed.h / 2,
        width: pressed.w,
        height: pressed.h,
        "border-radius": pressed.r ?? pressed.h / 2,
      });
      this.press.style.opacity = String(0.16 * held);
    }
  }
}

// ---------------------------------------------------------------------------
// The iPhone
// ---------------------------------------------------------------------------

/**
 * The iPhone's screen shape: the owner's iPhone (1320 × 2868); the simulator's stills
 * (1179 × 2556) are the same within a pixel. Recordings without the status bar (1320 × 2706)
 * sit below it.
 */
export const PHONE_ASPECT = 2868 / 1320;

/** A current iPhone: thin black border, titanium edge, Dynamic Island, status bar, the screen. */
export class Phone {
  el: HTMLDivElement;
  screen: HTMLDivElement;
  w: number;
  h: number;
  k: number;
  bezel: number;
  status: HTMLDivElement;
  private taps: Tap[] = [];

  constructor(
    parent: HTMLElement,
    width = 420,
    opts: {
      status?: "dark" | "light" | "none";
      time?: string;
      aspect?: number;
      island?: boolean;
      /** A dark-mode screen. */
      dark?: boolean;
    } = {},
  ) {
    this.w = width;
    this.k = width / 1179;
    this.h = width * (opts.aspect ?? PHONE_ASPECT);
    this.bezel = Math.round(width * 0.026);
    const b = this.bezel;
    this.el = div("abs", parent);
    css(this.el, {
      width: this.w + b * 2,
      height: this.h + b * 2,
      "border-radius": width * 0.15,
      background: "#050608",
      // The titanium band, then a soft contact shadow under the phone (no glow).
      "box-shadow":
        "0 0 0 2.5px #8f969c, 0 0 0 3.5px #2b3035, 0 34px 60px rgba(0,0,0,0.38), 0 10px 18px rgba(0,0,0,0.28)",
    });
    this.screen = div("abs", this.el);
    css(this.screen, {
      left: b,
      top: b,
      width: this.w,
      height: this.h,
      "border-radius": width * 0.125,
      overflow: "hidden",
      // The app's own background, so the clear area under a short screenshot never shows.
      background: opts.dark ? "var(--app-bg-dark)" : "var(--app-bg)",
    });
    this.status = div("abs", this.screen);
    if (opts.status !== "none") this.statusBar(opts.status ?? "dark", opts.time ?? "7:42");
    const island = div("abs", this.screen);
    css(island, {
      left: this.w / 2 - width * 0.155,
      top: width * 0.028,
      width: width * 0.31,
      height: width * 0.092,
      "border-radius": width * 0.05,
      background: "#000",
      "z-index": 20,
      display: opts.island === false ? "none" : "",
    });
  }

  statusBar(tone: "dark" | "light", time: string) {
    const c = tone === "dark" ? "#000" : "#fff";
    const s = this.w / 393;
    this.status.innerHTML = `
      <div style="position:absolute;left:${48 * s}px;top:${17 * s}px;font:600 ${17 * s}px 'Public Sans',sans-serif;color:${c};letter-spacing:-0.01em">${time}</div>
      <svg style="position:absolute;right:${30 * s}px;top:${20 * s}px" width="${78 * s}" height="${14 * s}" viewBox="0 0 78 14">
        <g fill="${c}">
          <rect x="0" y="9" width="3" height="5" rx="1"/><rect x="5" y="6" width="3" height="8" rx="1"/>
          <rect x="10" y="3" width="3" height="11" rx="1"/><rect x="15" y="0" width="3" height="14" rx="1"/>
          <path d="M31 4.2a9 9 0 0 1 12 0l-1.4 1.5a7 7 0 0 0-9.2 0zM33.4 6.7a5.6 5.6 0 0 1 7.2 0L39.2 8.2a3.6 3.6 0 0 0-4.4 0zM35.8 9.2a2.2 2.2 0 0 1 2.4 0L37 10.6z"/>
          <rect x="52" y="1" width="22" height="12" rx="3.5" fill="none" stroke="${c}" stroke-opacity="0.4"/>
          <rect x="54" y="3" width="17" height="8" rx="2"/><rect x="75" y="5" width="2" height="4" rx="1" fill-opacity="0.45"/>
        </g>
      </svg>`;
    // On light screens the bar sits on the app's background, so scrolled content passes under it.
    css(this.status, {
      width: this.w,
      height: 54 * s,
      "z-index": 15,
      background: tone === "dark" ? "var(--app-bg)" : "transparent",
    });
  }

  /** A screenshot layer, `srcWidth` pixels wide (1179: the iPhone screenshots and phone captures). */
  layer(src: string, srcWidth = 1179): Layer {
    const l = new Layer(this.screen, src, this.w / srcWidth, this.w);
    this.screen.insertBefore(l.el, this.status);
    return l;
  }

  /** A form sheet screen, to slide up over the screen. */
  sheet(src: string, srcWidth = 1179): Sheet {
    return new Sheet(this, src, srcWidth);
  }

  /**
   * A screen recording layer. A recording shorter than the screen was cut below the status bar,
   * so it sits at the bottom, under the drawn status bar.
   */
  clip(clip: Clip): ClipLayer {
    const h = (clip.height * this.w) / clip.width;
    const l = new ClipLayer(this.screen, clip, this.w, Math.max(0, this.h - h));
    this.screen.insertBefore(l.el, this.status);
    return l;
  }

  private tapEl(i: number): Tap {
    while (this.taps.length <= i) this.taps.push(new Tap(this.screen, 120 * this.k));
    const tap = this.taps[i]!;
    this.screen.appendChild(tap.press);
    this.screen.appendChild(tap.ring);
    return tap;
  }

  /**
   * Draws tap `i` at a point in screenshot pixels (minus the layer's scroll); `pressed` is the
   * control's size in screenshot pixels.
   */
  drawTap(
    i: number,
    x: number,
    y: number,
    t: number,
    scroll = 0,
    pressed?: { w: number; h: number; r?: number },
  ) {
    this.tapAt(i, x * this.k, (y - scroll) * this.k, t, pressed && scalePress(pressed, this.k));
  }

  /** Draws tap `i` at a point in the screen's own pixels. */
  tapAt(
    i: number,
    x: number,
    y: number,
    t: number,
    pressed?: { w: number; h: number; r?: number },
  ) {
    this.tapEl(i).draw(x, y, t, 120 * this.k, pressed);
  }

  get outerW() {
    return this.w + this.bezel * 2;
  }
  get outerH() {
    return this.h + this.bezel * 2;
  }
}

const scalePress = (p: { w: number; h: number; r?: number }, k: number) => ({
  w: p.w * k,
  h: p.h * k,
  ...(p.r !== undefined ? { r: p.r * k } : {}),
});

// ---------------------------------------------------------------------------
// The browser
// ---------------------------------------------------------------------------

/** A desktop browser window: a quiet title bar with the address, then the page (1440 × 900). */
export class Browser {
  el: HTMLDivElement;
  page: HTMLDivElement;
  url: HTMLDivElement;
  w: number;
  h: number;
  bar: number;
  /** Stage pixels per screenshot pixel (2× captures: 2880 wide). */
  k: number;
  private taps: Tap[] = [];

  constructor(parent: HTMLElement, width = 1440, address = "sundeckpro.com", captureWidth = 2880) {
    this.w = width;
    this.k = width / captureWidth;
    this.h = (width * 900) / 1440;
    this.bar = Math.round(width * 0.03);
    this.el = div("abs", parent);
    css(this.el, {
      width: this.w,
      height: this.h + this.bar,
      "border-radius": 14,
      overflow: "hidden",
      background: "var(--n100)",
      border: "1px solid rgba(0,0,0,0.25)",
      "box-shadow": "0 40px 70px rgba(0,0,0,0.36), 0 12px 22px rgba(0,0,0,0.26)",
    });
    const top = div("abs", this.el);
    css(top, {
      width: this.w,
      height: this.bar,
      background: "var(--n200)",
      "border-bottom": "1px solid var(--n300)",
    });
    const r = this.bar * 0.2;
    ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => {
      const dot = div("abs", top);
      css(dot, {
        left: this.bar * 0.55 + i * r * 3.2,
        top: this.bar / 2 - r,
        width: r * 2,
        height: r * 2,
        "border-radius": "50%",
        background: c,
      });
    });
    this.url = div("abs", top, address);
    css(this.url, {
      left: this.w * 0.33,
      top: this.bar * 0.18,
      width: this.w * 0.34,
      height: this.bar * 0.64,
      "border-radius": this.bar * 0.32,
      background: "var(--n50)",
      color: "var(--n600)",
      font: `500 ${this.bar * 0.36}px 'Public Sans', sans-serif`,
      "line-height": `${this.bar * 0.64}px`,
      "text-align": "center",
    });
    this.page = div("abs", this.el);
    css(this.page, {
      top: this.bar,
      width: this.w,
      height: this.h,
      overflow: "hidden",
      background: "var(--n50)",
    });
  }

  layer(src: string): Layer {
    return new Layer(this.page, src, this.k, this.w);
  }

  drawTap(
    i: number,
    x: number,
    y: number,
    t: number,
    scroll = 0,
    pressed?: { w: number; h: number; r?: number },
  ) {
    while (this.taps.length <= i) this.taps.push(new Tap(this.page, 60));
    const tap = this.taps[i]!;
    this.page.appendChild(tap.press);
    this.page.appendChild(tap.ring);
    tap.draw(x * this.k, (y - scroll) * this.k, t, 60, pressed && scalePress(pressed, this.k));
  }

  get outerW() {
    return this.w;
  }
  get outerH() {
    return this.h + this.bar;
  }
}
