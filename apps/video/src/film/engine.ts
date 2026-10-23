// The film's frame engine: a 1920 × 1080 stage of scenes, each placed on the timeline and
// drawn from the time alone, so any frame can be rendered on its own and in any order (render.ts
// splits the film across several browsers).

export const W = 1920;
export const H = 1080;

export interface Scene {
  start: number;
  end: number;
  /** Stacking order: backgrounds low, captions high. */
  z: number;
  /** Builds the scene's elements once; returns how to draw them at a time. */
  build: (el: HTMLElement) => (t: number, d: number) => void;
}

interface Mounted {
  scene: Scene;
  el: HTMLElement;
  draw: (t: number, d: number) => void;
}

export class Stage {
  root: HTMLElement;
  scenes: Scene[] = [];
  private mounted = new Map<Scene, Mounted>();

  constructor(root: HTMLElement) {
    this.root = root;
  }

  add(scene: Scene) {
    this.scenes.push(scene);
    return scene;
  }

  /** Draws the frame at `time` seconds. */
  draw(time: number) {
    for (const scene of this.scenes) {
      const active = time >= scene.start && time < scene.end;
      let m = this.mounted.get(scene);
      if (!active) {
        // Off screen: let it go, so a browser holds only the shots it's drawing (built again
        // from scratch if the time comes back).
        if (m) {
          m.el.remove();
          this.mounted.delete(scene);
        }
        continue;
      }
      if (!m) {
        const el = div("scene");
        el.style.zIndex = String(scene.z);
        this.root.appendChild(el);
        m = { scene, el, draw: scene.build(el) };
        this.mounted.set(scene, m);
      }
      m.el.style.display = "";
      m.draw(time - scene.start, scene.end - scene.start);
    }
  }
}

// ---------------------------------------------------------------------------
// Easing and time
// ---------------------------------------------------------------------------

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
/** 0 → 1 as t goes from a to b. */
export const ramp = (t: number, a: number, b: number) =>
  b === a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a));
export const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
export const easeIn = (p: number) => p * p * p;
export const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
export const expoOut = (p: number) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
/** A slam: overshoots its size a little and settles. */
export const slam = (p: number) => {
  if (p >= 1) return 1;
  const s = 1.7;
  const q = p - 1;
  return 1 + q * q * ((s + 1) * q + s);
};

/** Keyframes: [time, value] pairs, eased between. */
export function keys(t: number, frames: [number, number][], ease = easeInOut): number {
  if (!frames.length) return 0;
  if (t <= frames[0]![0]) return frames[0]![1];
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1] = frames[i]!;
    const [t0, v0] = frames[i - 1]!;
    if (t <= t1) return lerp(v0, v1, ease(ramp(t, t0, t1)));
  }
  return frames[frames.length - 1]![1];
}

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

export function div(className = "", parent?: HTMLElement, text?: string): HTMLDivElement {
  const el = document.createElement("div");
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  parent?.appendChild(el);
  return el;
}

export function img(src: string, parent?: HTMLElement, className = ""): HTMLImageElement {
  const el = document.createElement("img");
  el.src = src;
  el.decoding = "sync";
  if (className) el.className = className;
  parent?.appendChild(el);
  return el;
}

export function css(el: HTMLElement, styles: Partial<Record<string, string | number>>) {
  for (const [k, v] of Object.entries(styles)) {
    if (v === undefined) continue;
    el.style.setProperty(
      k,
      typeof v === "number" && !k.startsWith("--") && k !== "opacity" && k !== "z-index"
        ? `${v}px`
        : String(v),
    );
  }
  return el;
}

/** A seeded random number generator, so every browser draws the same textures. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Loads every image before the first frame, so no frame is drawn half-loaded. */
export async function preload(urls: string[]) {
  await Promise.all(
    [...new Set(urls)].map(
      (u) =>
        new Promise<void>((resolve) => {
          const i = new Image();
          i.onload = () =>
            i.decode().then(
              () => resolve(),
              () => resolve(),
            );
          i.onerror = () => resolve();
          i.src = u;
        }),
    ),
  );
}
