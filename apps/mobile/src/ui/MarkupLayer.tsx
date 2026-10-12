import Svg, { Ellipse, G, Line, Polygon, Text as SvgText } from "react-native-svg";
import { arrowHead, type MarkupShape } from "@leakbook/core";
import { font, markupColor } from "./theme";

/**
 * Draws markup over a photo. Shapes are stored as fractions of the image, so the same
 * markup lines up on a thumbnail, the full-screen viewer, and the office view. Each shape
 * gets a dark outline so it reads on bright and dark photos alike.
 */
export function MarkupLayer({
  shapes,
  width,
  height,
  scale = 1,
}: {
  shapes: MarkupShape[];
  width: number;
  height: number;
  /** 1 on the full viewer; smaller on thumbnails. */
  scale?: number;
}) {
  if (width === 0 || height === 0) return null;
  const stroke = Math.max(2, 4 * scale);
  const outline = stroke + Math.max(1.5, 3 * scale);
  return (
    <Svg
      width={width}
      height={height}
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
          const head = arrowHead(x1, y1, x2, y2, Math.max(10, 22 * scale))
            .map(([x, y]) => `${x},${y}`)
            .join(" ");
          return (
            <G key={i}>
              <Line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={markupColor.outline}
                strokeWidth={outline}
                strokeLinecap="round"
              />
              <Polygon points={head} fill={c} stroke={markupColor.outline} strokeWidth={1.5} />
              <Line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={c}
                strokeWidth={stroke}
                strokeLinecap="round"
              />
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
        const size = Math.max(10, 24 * scale);
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
