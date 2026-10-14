import { poolDiagram, type DiagramShape } from "@leakbook/core";

export interface Pin {
  id: string;
  x: number;
  y: number;
  color: string;
  label: string;
}

/** Top-down pool with numbered finding pins, drawn from the same shapes as the phone. */
export function PoolDiagram({
  shape,
  hasSpa,
  pins,
  title,
  className = "w-full rounded-2xl border border-border bg-surface",
}: {
  shape: DiagramShape | null | undefined;
  hasSpa: boolean;
  pins: Pin[];
  title: string;
  /** The job page draws it as a plain rounded panel (no outline) on the grouped gray. */
  className?: string;
}) {
  const d = poolDiagram(shape, hasSpa);
  return (
    <svg viewBox={`0 0 ${d.width} ${d.height}`} role="img" aria-label={title} className={className}>
      <path d={d.pool} className="fill-diagram-water stroke-water" strokeWidth={2} />
      {d.spa ? (
        <>
          <circle
            cx={d.spa.cx}
            cy={d.spa.cy}
            r={d.spa.r}
            className="fill-diagram-water stroke-water"
            strokeWidth={2}
          />
          <text
            x={d.spa.cx}
            y={d.spa.cy + 3}
            fontSize={7}
            textAnchor="middle"
            className="fill-water font-display font-bold"
          >
            SPA
          </text>
        </>
      ) : null}
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
  );
}
