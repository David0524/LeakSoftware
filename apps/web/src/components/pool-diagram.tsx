import {
  parseDiagramLayout,
  poolDiagram,
  type DiagramShape,
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

/** The pool and its spa, inside a diagram's <svg> (shared by every diagram on the site). */
export function DiagramShapes({ d }: { d: Drawing }) {
  return (
    <>
      <path d={d.pool} className="fill-diagram-water stroke-water" strokeWidth={2} />
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
  const d = poolDiagram(shape, hasSpa, parseDiagramLayout(layout));
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
