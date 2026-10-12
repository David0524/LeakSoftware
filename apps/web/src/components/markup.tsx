import { arrowHead, type MarkupShape } from "@leakbook/core";
import { tokens } from "@leakbook/tokens";

const C = tokens.color.markup;

/**
 * Photo markup drawn over the original, in the photo's own pixel space so it scales with
 * the image. Same shapes and colors as the phone (apps/mobile/src/ui/MarkupLayer.tsx).
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
          const head = arrowHead(x1, y1, x2, y2, Math.max(10, 22 * unit))
            .map(([x, y]) => `${x},${y}`)
            .join(" ");
          return (
            <g key={i} strokeLinecap="round">
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.outline} strokeWidth={outline} />
              <polygon points={head} fill={c} stroke={C.outline} strokeWidth={1.5} />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={stroke} />
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
