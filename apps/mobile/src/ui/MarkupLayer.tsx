import Svg, { Ellipse, G, Line, Path, Polygon, Text as SvgText } from "react-native-svg";
import { arrowShape, penPath, type MarkupShape } from "@leakbook/core";
import { font, markupColor } from "./theme";

/** The pixel space a pool diagram's markup is drawn in: its 160 x 100, five times over. */
export const DIAGRAM_MARKUP_SPACE = { width: 800, height: 500 };

/**
 * Draws markup over a photo. Shapes are stored as fractions of the image, so the same
 * markup lines up on a thumbnail, the full-screen viewer, and the office view. Each shape
 * gets a dark outline so it reads on bright and dark photos alike.
 */
export function MarkupLayer({
  shapes,
  width: outerWidth,
  height: outerHeight,
  scale: outerScale = 1,
  space,
}: {
  shapes: MarkupShape[];
  width: number;
  height: number;
  /** 1 on the full viewer; smaller on thumbnails. */
  scale?: number;
  /**
   * Draw in this pixel space, scaled to width x height: a pool diagram's markup uses 800 x 500
   * over its 160 x 100 drawing, as the website does (DIAGRAM_MARKUP_SPACE), so its lines weigh
   * the same as on a photo. `scale` is then the space's (its width over 400).
   */
  space?: { width: number; height: number };
}) {
  if (outerWidth === 0 || outerHeight === 0) return null;
  const width = space?.width ?? outerWidth;
  const height = space?.height ?? outerHeight;
  const scale = space ? space.width / 400 : outerScale;
  const stroke = Math.max(2, 4 * scale);
  const outline = stroke + Math.max(1.5, 3 * scale);
  return (
    <Svg
      width={outerWidth}
      height={outerHeight}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", left: 0, top: 0 }}
      pointerEvents="none"
    >
      {shapes.map((s, i) => {
        const c = markupColor[s.color];
        if (s.type === "arrow") {
          const x1 = s.x1 * width;
          const y1 = s.y1 * height;
          const x2 = s.x2 * width;
          const y2 = s.y2 * height;
          const { shaftEnd, head } = arrowShape(x1, y1, x2, y2, scale);
          const points = head.map(([x, y]) => `${x},${y}`).join(" ");
          // Outline first (shaft and head), then the color; the head on top keeps its point
          // (owner, 2026-10-19), as the website's MarkupOverlay.
          return (
            <G key={i} strokeLinecap="round" strokeLinejoin="round">
              <Line
                x1={x1}
                y1={y1}
                x2={shaftEnd[0]}
                y2={shaftEnd[1]}
                stroke={markupColor.outline}
                strokeWidth={outline}
              />
              <Polygon
                points={points}
                fill={markupColor.outline}
                stroke={markupColor.outline}
                strokeWidth={outline - stroke}
              />
              <Line
                x1={x1}
                y1={y1}
                x2={shaftEnd[0]}
                y2={shaftEnd[1]}
                stroke={c}
                strokeWidth={stroke}
              />
              <Polygon points={points} fill={c} />
            </G>
          );
        }
        if (s.type === "circle") {
          const common = {
            cx: s.cx * width,
            cy: s.cy * height,
            rx: s.rx * width,
            ry: s.ry * height,
          };
          return (
            <G key={i}>
              <Ellipse {...common} fill="none" stroke={markupColor.outline} strokeWidth={outline} />
              <Ellipse {...common} fill="none" stroke={c} strokeWidth={stroke} />
            </G>
          );
        }
        if (s.type === "pen") {
          // Freehand, from the Pen tool (owner, 2026-10-19).
          const d = penPath(s.points, width, height);
          return (
            <G key={i} fill="none" strokeLinecap="round" strokeLinejoin="round">
              <Path d={d} stroke={markupColor.outline} strokeWidth={outline} />
              <Path d={d} stroke={c} strokeWidth={stroke} />
            </G>
          );
        }
        // Its own size (owner, 2026-10-20), 1 being the standard.
        const size = Math.max(10, 24 * scale) * (s.s ?? 1);
        const text = {
          x: s.x * width,
          y: s.y * height,
          fontSize: size,
          fontFamily: font.displayBold,
          textAnchor: "middle" as const,
        };
        // Outline first, then the fill on top (paint-order is not supported natively).
        return (
          <G key={i}>
            <SvgText
              {...text}
              fill={markupColor.outline}
              stroke={markupColor.outline}
              strokeWidth={Math.max(2, size / 5)}
              strokeLinejoin="round"
            >
              {s.text}
            </SvgText>
            <SvgText {...text} fill={c}>
              {s.text}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}
