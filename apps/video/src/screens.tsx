// Real screens in device frames: a browser window for the owner's website, an iPhone for the
// tech's app and the customer's phone. Each screen is a run of captured PNGs (record/web.mjs,
// the iPhone suite) that cross-fade on cue, a camera that pushes in on what matters, and a tap
// ring that lands on the real control a beat before the screen changes.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  Easing,
  Img,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { brand, neutral, text } from "./theme";
import { FPS } from "./timing";

/** Where a captured control sat, in CSS pixels of the capture. */
export type Box = { x: number; y: number; width: number; height: number };

export type Frame = {
  /** A PNG under assets/, e.g. "generated/web/leak-week.png". */
  src: string;
  /** Seconds into the scene when it starts showing. */
  at: number;
  /** For a long page: scroll from one CSS-pixel offset to another over the frame's time. */
  scroll?: { from: number; to: number; start: number; end: number };
  /** The phone's status bar while this frame shows, when it differs from the screen's. */
  bar?: StatusBar;
};

/** The camera on the screen: zoom and the CSS-pixel point at the middle of the view. */
export type Camera = { at: number; zoom: number; x: number; y: number };

export type Tap = { at: number; x: number; y: number } | { at: number; box: string; frame: string };

export type Screen = {
  frames: Frame[];
  /** CSS-pixel size of the capture's viewport. */
  size: { width: number; height: number };
  /** Pixels per CSS pixel in the PNGs. */
  scale: number;
  camera?: Camera[];
  taps?: Tap[];
  /** Browser windows show this in the address bar. */
  url?: string;
};

const ease = Easing.bezier(0.45, 0, 0.2, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** What record/web.mjs saved next to each PNG (control boxes, page size), loaded once. */
type Capture = { boxes: Record<string, Box>; height?: number };
const boxCache = new Map<string, Capture>();
function useBoxes(srcs: string[]) {
  const [, setTick] = useState(0);
  const missing = srcs.filter((s) => !boxCache.has(s));
  const key = missing.join("|");
  useEffect(() => {
    if (!key) return;
    const handle = delayRender(`boxes ${key}`);
    Promise.all(
      key.split("|").map(async (src) => {
        const res = await fetch(staticFile(src.replace(/\.png$/, ".json")));
        const json = res.ok ? await res.json() : {};
        boxCache.set(src, { boxes: json.boxes ?? {}, height: json.size?.height });
      }),
    ).then(() => {
      setTick((t) => t + 1);
      continueRender(handle);
    });
  }, [key]);
  return (src: string) => boxCache.get(src) ?? { boxes: {} };
}

function cameraAt(t: number, keys: Camera[] | undefined, size: Screen["size"]) {
  const rest = { at: 0, zoom: 1, x: size.width / 2, y: size.height / 2 };
  if (!keys?.length) return rest;
  const all = keys[0]!.at > 0 ? [rest, ...keys] : keys;
  const i = all.findIndex((k) => k.at > t);
  if (i === -1) return all[all.length - 1]!;
  if (i === 0) return all[0]!;
  const a = all[i - 1]!;
  const b = all[i]!;
  // Each move takes up to 1.2 s and ends on its key, so the view holds still while read.
  const start = Math.max(a.at, b.at - 1.2);
  const p = interpolate(t, [start, b.at], [0, 1], { ...clamp, easing: ease });
  return {
    at: t,
    zoom: a.zoom + (b.zoom - a.zoom) * p,
    x: a.x + (b.x - a.x) * p,
    y: a.y + (b.y - a.y) * p,
  };
}

/** The screen's content at a given display width (its height follows the capture's shape). */
function ScreenContent({
  screen,
  width,
  inset = 0,
}: {
  screen: Screen;
  width: number;
  inset?: number;
}) {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const boxes = useBoxes(screen.frames.map((f) => f.src));
  const k = width / screen.size.width;
  const height = screen.size.height * k;
  const cam = cameraAt(t, screen.camera, screen.size);
  // Keep the view inside the page at every zoom.
  const halfW = screen.size.width / 2 / cam.zoom;
  const halfH = screen.size.height / 2 / cam.zoom;
  const cx = Math.min(Math.max(cam.x, halfW), screen.size.width - halfW);
  const cy = Math.min(Math.max(cam.y, halfH), screen.size.height - halfH);
  const view: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: screen.size.width,
    transformOrigin: "0 0",
    transform: `scale(${k * cam.zoom}) translate(${-(cx - halfW)}px, ${-(cy - halfH)}px)`,
  };
  return (
    <div
      style={{ position: "relative", width, height, overflow: "hidden", background: neutral[50] }}
    >
      <div style={view}>
        {screen.frames.map((f, i) => {
          const next = screen.frames[i + 1];
          const fadeIn =
            i === 0 ? 1 : interpolate(t, [f.at, f.at + 0.3], [0, 1], { ...clamp, easing: ease });
          if (t < f.at || (next && t > next.at + 0.3)) return null;
          // Never scroll past the page's end (the status bar covers `inset` of the view).
          const page = boxes(f.src).height;
          const max = page ? Math.max(0, page - (screen.size.height - inset)) : Infinity;
          const y = f.scroll
            ? Math.min(
                max,
                interpolate(t, [f.scroll.start, f.scroll.end], [f.scroll.from, f.scroll.to], {
                  ...clamp,
                  easing: ease,
                }),
              )
            : 0;
          return (
            <Img
              key={f.src + i}
              src={staticFile(f.src)}
              style={{
                position: "absolute",
                left: 0,
                top: -y,
                width: screen.size.width,
                opacity: fadeIn,
              }}
            />
          );
        })}
        {screen.taps?.map((tap, i) => {
          const point =
            "box" in tap
              ? (() => {
                  const b = boxes(tap.frame).boxes[tap.box];
                  return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : undefined;
                })()
              : tap;
          return point ? (
            <TapRing key={i} at={tap.at} x={point.x} y={point.y} zoom={cam.zoom * k} />
          ) : null;
        })}
      </div>
    </div>
  );
}

/** A ring closes in on the control, then a press ripples out from it. */
function TapRing({ at, x, y, zoom }: { at: number; x: number; y: number; zoom: number }) {
  const t = useCurrentFrame() / FPS;
  if (t < at - 0.5 || t > at + 0.45) return null;
  const approach = interpolate(t, [at - 0.5, at], [0, 1], { ...clamp, easing: ease });
  const press = interpolate(t, [at, at + 0.45], [0, 1], clamp);
  // The ring keeps one size on screen whatever the camera's zoom.
  const size = 64 / zoom;
  const ring: CSSProperties = {
    position: "absolute",
    left: x - size / 2,
    top: y - size / 2,
    width: size,
    height: size,
    borderRadius: "50%",
  };
  return (
    <>
      <div
        style={{
          ...ring,
          border: `${5 / zoom}px solid ${brand.water}`,
          boxShadow: `0 0 0 ${2 / zoom}px ${brand.paper}`,
          opacity: t < at ? approach : 1 - press,
          transform: `scale(${t < at ? 1.8 - 0.8 * approach : 1 - 0.15 * Math.sin(press * Math.PI)})`,
        }}
      />
      {t >= at && (
        <div
          style={{
            ...ring,
            background: brand.water,
            opacity: 0.35 * (1 - press),
            transform: `scale(${1 + press * 1.2})`,
          }}
        />
      )}
    </>
  );
}

const shadow = (s: number) =>
  `0 ${24 * s}px ${64 * s}px rgba(18, 38, 58, 0.18), 0 ${4 * s}px ${12 * s}px rgba(18, 38, 58, 0.08)`;

export function Browser({
  screen,
  width,
  style,
}: {
  screen: Screen;
  width: number;
  style?: CSSProperties;
}) {
  const s = width / 1200;
  const bar = 44 * s;
  return (
    <div
      style={{
        width,
        borderRadius: 16 * s,
        overflow: "hidden",
        background: brand.paper,
        boxShadow: shadow(s),
        ...style,
      }}
    >
      <div
        style={{
          height: bar,
          display: "flex",
          alignItems: "center",
          padding: `0 ${16 * s}px`,
          gap: 8 * s,
          background: neutral[100],
          borderBottom: `${1 * s}px solid ${neutral[200]}`,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{ width: 12 * s, height: 12 * s, borderRadius: "50%", background: neutral[300] }}
          />
        ))}
        <div
          style={{
            margin: "0 auto",
            width: "46%",
            height: 26 * s,
            borderRadius: 999,
            background: brand.paper,
            fontFamily: text,
            fontSize: 14 * s,
            color: neutral[600],
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {screen.url ?? "sundeckpro.com"}
        </div>
        <div style={{ width: 52 * s }} />
      </div>
      <ScreenContent screen={screen} width={width} />
    </div>
  );
}

/** An iPhone 17 (402 × 874 points), drawn as a plain black frame with the Dynamic Island. */
export type StatusBar = { background: string; color: string };

/** The iPhone's status bar, for website captures (the app's own screens bring theirs). */
function StatusBarView({ bar, width }: { bar: StatusBar; width: number }) {
  const s = width / 402;
  return (
    <div
      style={{
        height: 54 * s,
        background: bar.background,
        color: bar.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `${6 * s}px ${34 * s}px 0`,
        boxSizing: "border-box",
        fontFamily: text,
        fontWeight: 600,
        fontSize: 17 * s,
      }}
    >
      <span>9:41</span>
      <span style={{ display: "flex", gap: 6 * s, alignItems: "center" }}>
        {[5, 8, 11, 14].map((h) => (
          <span
            key={h}
            style={{ width: 3.5 * s, height: h * s, background: bar.color, borderRadius: 1 * s }}
          />
        ))}
        <span
          style={{
            marginLeft: 6 * s,
            width: 25 * s,
            height: 12 * s,
            borderRadius: 4 * s,
            border: `${1.2 * s}px solid ${bar.color}`,
            padding: 1.5 * s,
            boxSizing: "border-box",
          }}
        >
          <span
            style={{
              display: "block",
              width: "80%",
              height: "100%",
              background: bar.color,
              borderRadius: 2 * s,
            }}
          />
        </span>
      </span>
    </div>
  );
}

function activeBar(screen: Screen, fallback: StatusBar) {
  const t = useCurrentFrame() / FPS;
  const current = [...screen.frames].reverse().find((f) => f.at <= t);
  return current?.bar ?? fallback;
}

export function Phone({
  screen,
  height,
  style,
  overlay,
  statusBar,
}: {
  screen: Screen;
  height: number;
  style?: CSSProperties;
  overlay?: ReactNode;
  statusBar?: StatusBar;
}) {
  const bezel = height * 0.018;
  const inner = height - bezel * 2;
  const width = (inner * 402) / 874 + bezel * 2;
  const radius = width * 0.17;
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: "#0B0B0C",
        padding: bezel,
        boxSizing: "border-box",
        boxShadow: `${shadow(height / 900)}, inset 0 0 0 ${height * 0.003}px #3A3A3C`,
        position: "relative",
        ...style,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: radius - bezel,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {statusBar && (
          <StatusBarView bar={activeBar(screen, statusBar)} width={width - bezel * 2} />
        )}
        <ScreenContent screen={screen} width={width - bezel * 2} inset={statusBar ? 54 : 0} />
        {overlay}
        <div
          style={{
            position: "absolute",
            top: inner * 0.013,
            left: "50%",
            width: (width - bezel * 2) * 0.31,
            height: inner * 0.042,
            marginLeft: -((width - bezel * 2) * 0.31) / 2,
            borderRadius: 999,
            background: "#000",
          }}
        />
      </div>
    </div>
  );
}
