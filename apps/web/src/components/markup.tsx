import { arrowShape, penPath, type MarkupShape } from "@leakbook/core";
import { tokens } from "@leakbook/tokens";

const C = tokens.color.markup;

/**
 * Markup drawn over a photo or a pool diagram, in its own pixel space so it scales with it.
 * Same shapes and colors as the phone (apps/mobile/src/ui/MarkupLayer.tsx). A diagram uses
 * DIAGRAM_MARKUP_SPACE, so its lines weigh the same as on a photo.
 */
export function MarkupOverlay({
  shapes,
  width,
  height,
}: {
  shapes: MarkupShape[];
  width: number;
  height: number;
}) {
  if (shapes.length === 0) return null;
  const unit = width / 400;
  const stroke = Math.max(2, 4 * unit);
  const outline = stroke + Math.max(1.5, 3 * unit);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      {shapes.map((s, i) => {
        const c = C[s.color];
        if (s.type === "arrow") {
          const [x1, y1, x2, y2] = [s.x1 * width, s.y1 * height, s.x2 * width, s.y2 * height];
          const { shaftEnd, head } = arrowShape(x1, y1, x2, y2, unit);
          const points = head.map(([x, y]) => `${x},${y}`).join(" ");
          // Outline first (shaft and head), then the color; the head on top keeps its point.
          return (
            <g key={i} strokeLinecap="round" strokeLinejoin="round">
              <line
                x1={x1}
                y1={y1}
                x2={shaftEnd[0]}
                y2={shaftEnd[1]}
                stroke={C.outline}
                strokeWidth={outline}
              />
              <polygon
                points={points}
                fill={C.outline}
                stroke={C.outline}
                strokeWidth={outline - stroke}
              />
              <line
                x1={x1}
                y1={y1}
                x2={shaftEnd[0]}
                y2={shaftEnd[1]}
                stroke={c}
                strokeWidth={stroke}
              />
              <polygon points={points} fill={c} />
            </g>
          );
        }
        if (s.type === "circle") {
          const e = { cx: s.cx * width, cy: s.cy * height, rx: s.rx * width, ry: s.ry * height };
          return (
            <g key={i} fill="none">
              <ellipse {...e} stroke={C.outline} strokeWidth={outline} />
              <ellipse {...e} stroke={c} strokeWidth={stroke} />
            </g>
          );
        }
        if (s.type === "pen") {
          const d = penPath(s.points, width, height);
          return (
            <g key={i} fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d={d} stroke={C.outline} strokeWidth={outline} />
              <path d={d} stroke={c} strokeWidth={stroke} />
            </g>
          );
        }
        const size = Math.max(10, 24 * unit);
        return (
          <text
            key={i}
            x={s.x * width}
            y={s.y * height}
            fontSize={size}
            textAnchor="middle"
            fill={c}
            stroke={C.outline}
            strokeWidth={Math.max(2, size / 5)}
            strokeLinejoin="round"
            paintOrder="stroke"
            className="font-display font-bold"
          >
            {s.text}
          </text>
        );
      })}
    </svg>
  );
}

/** The pixel space diagram markup is drawn in: the diagram's 160 x 100, five times over. */
export const DIAGRAM_MARKUP_SPACE = { width: 800, height: 500 };
