import {
  shownDiagram,
  type DiagramShape,
  type LandmarkPart,
  type MarkupShape,
  type PoolDiagram as Drawing,
} from "@leakbook/core";
import { DIAGRAM_MARKUP_SPACE, MarkupOverlay } from "./markup";

export interface Pin {
  id: string;
  x: number;
  y: number;
  color: string;
  label: string;
}

/**
 * Where a landmark's 24 x 24 drawing goes: its size box on its center, mirrored when flipped
 * (left to right, or top to bottom for the steps).
 */
export function landmarkTransform(l: {
  cx: number;
  cy: number;
  size: number;
  flip: boolean;
  mirror?: "x" | "y";
  /** Quarter turns clockwise about its center (the steps, waterfall, skimmer, return, and suction line). */
  turn?: number;
}) {
  const k = l.size / 24;
  const turn = l.turn ? `rotate(${90 * l.turn} ${l.cx} ${l.cy}) ` : "";
  if (!l.flip) return `${turn}translate(${l.cx - l.size / 2} ${l.cy - l.size / 2}) scale(${k})`;
  return l.mirror === "y"
    ? `${turn}translate(${l.cx - l.size / 2} ${l.cy + l.size / 2}) scale(${k} ${-k})`
    : `${turn}translate(${l.cx + l.size / 2} ${l.cy - l.size / 2}) scale(${-k} ${k})`;
}

/**
 * A landmark's drawing (owner, 2026-10-19: "hard to interpret"): filled parts in their colors
 * with a thin dark outline; water streaks as white lines. In a 24 x 24 box.
 */
export function LandmarkArt({ parts, transform }: { parts: LandmarkPart[]; transform?: string }) {
  return (
    <g transform={transform} strokeLinecap="round" strokeLinejoin="round">
      {parts.map((p, i) =>
        p.tone === "foam" ? (
          <path key={i} d={p.d} fill="none" stroke={`var(--lb-landmark-foam)`} strokeWidth={1.4} />
        ) : (
          <path
            key={i}
            d={p.d}
            fill={`var(--lb-landmark-${kebab(p.tone)})`}
            stroke="var(--lb-landmark-outline)"
            strokeWidth={1}
          />
        ),
      )}
    </g>
  );
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** The pool and its spa, inside a diagram's <svg> (shared by every diagram on the site). */
export function DiagramShapes({ d }: { d: Drawing }) {
  return (
    <>
      {d.pool ? (
        <path d={d.pool} className="fill-diagram-water stroke-water" strokeWidth={2} />
      ) : null}
      {/* Drawn with Draw, in the pool's outline (owner, 2026-10-19). */}
      {d.drawing.map((path, i) => (
        <path
          key={`draw-${i}`}
          d={path}
          fill="none"
          className="stroke-water"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {d.landmarks.map((l, i) => (
        <LandmarkArt key={`landmark-${i}`} parts={l.parts} transform={landmarkTransform(l)} />
      ))}
      {d.spa ? (
        <>
          {d.spa.square ? (
            <rect
              x={d.spa.cx - d.spa.r}
              y={d.spa.cy - d.spa.r}
              width={d.spa.r * 2}
              height={d.spa.r * 2}
              rx={4}
              className="fill-diagram-water stroke-water"
              strokeWidth={2}
            />
          ) : (
            <circle
              cx={d.spa.cx}
              cy={d.spa.cy}
              r={d.spa.r}
              className="fill-diagram-water stroke-water"
              strokeWidth={2}
            />
          )}
          <text
            x={d.spa.cx}
            y={d.spa.cy + 3}
            fontSize={7}
            textAnchor="middle"
            className="pointer-events-none fill-water font-display font-bold"
          >
            SPA
          </text>
        </>
      ) : null}
    </>
  );
}

/**
 * Top-down pool with numbered finding pins and the job's markup (owner, 2026-10-19), drawn
 * from the same shapes as the phone.
 */
export function PoolDiagram({
  shape,
  hasSpa,
  layout,
  markup = [],
  pins,
  title,
  className = "w-full rounded-2xl border border-border bg-surface",
}: {
  shape: DiagramShape | null | undefined;
  hasSpa: boolean;
  /** property.diagram_layout: mirror and the spa's place. */
  layout?: unknown;
  markup?: MarkupShape[];
  pins: Pin[];
  title: string;
  /** The job page draws it as a plain rounded panel (no outline) on the grouped gray. */
  className?: string;
}) {
  const d = shownDiagram(shape, hasSpa, layout);
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${d.width} ${d.height}`}
        role="img"
        aria-label={title}
        className={className}
      >
        <DiagramShapes d={d} />
        {pins.map((p) => (
          <g key={p.id}>
            <circle cx={p.x * d.width} cy={p.y * d.height} r={7.5} className="fill-surface" />
            <circle cx={p.x * d.width} cy={p.y * d.height} r={6} fill={p.color} />
            <text
              x={p.x * d.width}
              y={p.y * d.height + 2.6}
              fontSize={7}
              textAnchor="middle"
              className="fill-paper font-display font-bold"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      <MarkupOverlay shapes={markup} {...DIAGRAM_MARKUP_SPACE} />
    </div>
  );
}
