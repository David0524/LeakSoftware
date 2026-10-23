// The film's look (docs/plans/launch-video.md, section 2): the brand's colors from
// brand/tokens.json as CSS variables, Barlow Semi Condensed and Public Sans from brand/fonts, and
// textures drawn in code: poured concrete, brushed steel and film grain. No gradients or glow.

import { H, W, rng } from "./engine.ts";

export interface Tokens {
  color: {
    brand: Record<"navy" | "water" | "safety" | "concrete" | "paper", string>;
    neutral: Record<string, string>;
    status: Record<string, string>;
    role: { light: Record<string, string>; dark: Record<string, string> };
  };
}

export let tokens: Tokens;

export async function loadLook() {
  tokens = (await (await fetch("/brand/tokens.json")).json()) as Tokens;
  const c = tokens.color;
  const vars: Record<string, string> = {
    "--navy": c.brand.navy,
    "--water": c.brand.water,
    "--safety": c.brand.safety,
    "--concrete": c.brand.concrete,
    "--paper": c.brand.paper,
    "--link": c.role.light.link!,
    "--app-bg": c.role.light.bg!,
    "--app-bg-dark": c.role.dark.bg!,
    "--link-dark": c.role.dark.link!,
    "--pass": c.status.pass!,
    "--fail": c.status.fail!,
  };
  for (const [k, v] of Object.entries(c.neutral)) vars[`--n${k}`] = v;
  for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);

  const faces: [string, string, string][] = [
    ["Barlow Semi Condensed", "BarlowSemiCondensed-ExtraBold.ttf", "800"],
    ["Barlow Semi Condensed", "BarlowSemiCondensed-Bold.ttf", "700"],
    ["Barlow Semi Condensed", "BarlowSemiCondensed-SemiBold.ttf", "600"],
    ["Public Sans", "PublicSans[wght].ttf", "100 900"],
  ];
  await Promise.all(
    faces.map(async ([family, file, weight]) => {
      const face = new FontFace(family, `url("/brand/fonts/${encodeURIComponent(file)}")`, {
        weight,
      });
      document.fonts.add(await face.load());
    }),
  );

  textures.concrete = concrete(1);
  textures.concreteLight = concrete(2, true);
  textures.steel = steel(3);
  textures.grain = Array.from({ length: 6 }, (_, i) => grain(10 + i));
  textures.stencil = stencil(21);
}

export const textures: {
  concrete: string;
  concreteLight: string;
  steel: string;
  grain: string[];
  stencil: string;
} = { concrete: "", concreteLight: "", steel: "", grain: [], stencil: "" };

function hex(c: string): [number, number, number] {
  const n = Number.parseInt(c.replace("#", "").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function canvas(w = W, h = H) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

/** Soft random blotches at a scale, drawn over the canvas at an opacity (value noise). */
function octave(
  ctx: CanvasRenderingContext2D,
  rand: () => number,
  cell: number,
  alpha: number,
  light: string,
  dark: string,
) {
  const [small, sctx] = canvas(Math.ceil(W / cell) + 2, Math.ceil(H / cell) + 2);
  const data = sctx.createImageData(small.width, small.height);
  const [lr, lg, lb] = hex(light);
  const [dr, dg, db] = hex(dark);
  for (let i = 0; i < small.width * small.height; i++) {
    const v = rand();
    data.data[i * 4] = dr + (lr - dr) * v;
    data.data[i * 4 + 1] = dg + (lg - dg) * v;
    data.data[i * 4 + 2] = db + (lb - db) * v;
    data.data[i * 4 + 3] = 255;
  }
  sctx.putImageData(data, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(small, -cell, -cell, small.width * cell, small.height * cell);
  ctx.restore();
}

function speckle(
  ctx: CanvasRenderingContext2D,
  rand: () => number,
  n: number,
  color: string,
  alpha: number,
  size: number,
) {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alpha * (0.4 + rand() * 0.6);
    const r = size * (0.4 + rand());
    ctx.beginPath();
    ctx.arc(rand() * W, rand() * H, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Poured concrete: mottled, with pores, aggregate specks and two formwork seams. */
function concrete(seed: number, light = false): string {
  const n = tokens.color.neutral;
  const [c, ctx] = canvas();
  const rand = rng(seed * 7919);
  const base = light ? n["300"]! : n["600"]!;
  const hi = light ? n["100"]! : n["400"]!;
  const lo = light ? n["400"]! : n["800"]!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  octave(ctx, rand, 420, 0.35, hi, lo);
  octave(ctx, rand, 140, 0.3, hi, lo);
  octave(ctx, rand, 40, 0.22, hi, lo);
  octave(ctx, rand, 9, 0.16, hi, lo);
  speckle(ctx, rand, 26000, lo, 0.35, 1.1);
  speckle(ctx, rand, 14000, hi, 0.3, 0.9);
  speckle(ctx, rand, 900, n["900"]!, 0.35, 2.2);
  // Formwork seams: one straight horizontal and one vertical joint, a touch darker.
  ctx.save();
  ctx.strokeStyle = n["900"]!;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 3;
  const y = H * (0.3 + rand() * 0.15);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(W, y + 4);
  ctx.moveTo(W * (0.62 + rand() * 0.2), 0);
  ctx.lineTo(W * (0.62 + rand() * 0.2) + 3, H);
  ctx.stroke();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = hi;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y + 3);
  ctx.lineTo(W, y + 7);
  ctx.stroke();
  // A hairline crack.
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = n["900"]!;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  let x = W * 0.1 + rand() * W * 0.2;
  let cy = H * 0.65 + rand() * H * 0.2;
  ctx.moveTo(x, cy);
  for (let i = 0; i < 40; i++) {
    x += 6 + rand() * 14;
    cy += (rand() - 0.5) * 16;
    ctx.lineTo(x, cy);
  }
  ctx.stroke();
  ctx.restore();
  return c.toDataURL("image/jpeg", 0.92);
}

/** Brushed steel in the navy family: fine horizontal grain, a few scratches. */
function steel(seed: number): string {
  const n = tokens.color.neutral;
  const [c, ctx] = canvas();
  const rand = rng(seed * 104729);
  ctx.fillStyle = n["900"]!;
  ctx.fillRect(0, 0, W, H);
  octave(ctx, rand, 300, 0.25, n["800"]!, n["900"]!);
  for (let y = 0; y < H; y++) {
    for (let k = 0; k < 3; k++) {
      ctx.globalAlpha = 0.03 + rand() * 0.06;
      ctx.strokeStyle = rand() < 0.5 ? n["700"]! : "#000000";
      const x0 = rand() * W;
      ctx.beginPath();
      ctx.moveTo(x0, y + 0.5);
      ctx.lineTo(x0 + 200 + rand() * 900, y + 0.5);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = n["500"]!;
  for (let i = 0; i < 26; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const a = (rand() - 0.5) * 0.6;
    const len = 60 + rand() * 260;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  speckle(ctx, rand, 6000, "#000000", 0.25, 0.8);
  return c.toDataURL("image/jpeg", 0.92);
}

/** A spray-paint mask: solid, with a sparse scatter of pinholes and a few worn patches. */
function stencil(seed: number): string {
  const [c, ctx] = canvas(640, 360);
  const rand = rng(seed * 4099);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 640, 360);
  ctx.fillStyle = "#000";
  for (let i = 0; i < 2600; i++) {
    ctx.globalAlpha = 0.3 + rand() * 0.7;
    ctx.fillRect(rand() * 640, rand() * 360, 1 + rand() * 1.5, 1 + rand() * 1.5);
  }
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    ctx.arc(rand() * 640, rand() * 360, 6 + rand() * 18, 0, Math.PI * 2);
    ctx.fill();
  }
  return c.toDataURL("image/png");
}

function grain(seed: number): string {
  const [c, ctx] = canvas(960, 540);
  const rand = rng(seed * 31337);
  const data = ctx.createImageData(960, 540);
  for (let i = 0; i < 960 * 540; i++) {
    const v = 128 + (rand() + rand() + rand() - 1.5) * 120;
    data.data[i * 4] = v;
    data.data[i * 4 + 1] = v;
    data.data[i * 4 + 2] = v;
    data.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return c.toDataURL("image/png");
}

export const STYLES = `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
body { font-family: "Public Sans", system-ui, sans-serif; color: var(--paper); -webkit-font-smoothing: antialiased; }
#stage { position: absolute; inset: 0; overflow: hidden; background: var(--navy); }
.scene { position: absolute; inset: 0; overflow: hidden; }
.fill { position: absolute; inset: 0; }
.bg { position: absolute; inset: -40px; background-size: cover; background-position: center; }
.abs { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.display { font-family: "Barlow Semi Condensed", sans-serif; font-weight: 800; text-transform: uppercase; letter-spacing: 0.005em; line-height: 0.92; }
.word { display: inline-block; transform-origin: 50% 70%; white-space: pre; }
.grain { position: absolute; inset: 0; background-size: ${W}px ${H}px; mix-blend-mode: soft-light; pointer-events: none; }
`;
