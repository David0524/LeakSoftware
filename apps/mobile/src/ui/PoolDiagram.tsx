import { useRef, useState } from "react";
import { Pressable, StyleSheet, View, type GestureResponderEvent } from "react-native";
import Svg, { Circle, G, Path, Rect, Text as SvgText } from "react-native-svg";
import { tokens } from "@leakbook/tokens";
import { useNoSwipe } from "./SwipeNav";
import {
  parseDiagramLayout,
  poolDiagram,
  type DiagramShape,
  type LandmarkPart,
  type MarkupShape,
  type PoolDiagram as Drawing,
} from "@leakbook/core";
import { DIAGRAM_MARKUP_SPACE, MarkupLayer } from "./MarkupLayer";
import { color, font } from "./theme";

export interface DiagramPin {
  id: string;
  x: number;
  y: number;
  color: string;
  label: string;
  /** The pin being placed or edited. */
  active?: boolean;
}

/**
 * Top-down pool with numbered finding pins. With onPlace, tapping drops a pin; positions
 * are fractions (0..1) of the diagram, the same on every screen size and on reports.
 */
export function PoolDiagram({
  shape,
  hasSpa,
  layout,
  pins,
  markup = [],
  onPlace,
  title = "Pool diagram",
  outlined = false,
  placing,
}: {
  shape: DiagramShape | null | undefined;
  hasSpa: boolean;
  /** property.diagram_layout as synced: the mirror and the spa's place, size, and shape. */
  layout?: unknown;
  pins: DiagramPin[];
  /** The job's diagram markup (job.diagram_markup), drawn in DIAGRAM_MARKUP_SPACE. */
  markup?: MarkupShape[];
  onPlace?: (x: number, y: number) => void;
  /** What a screen reader calls it ("Pool diagram with 2 finding pins"). */
  title?: string;
  /** The finding sheet's pin picker: a 1 pt outline, at most 448 wide (spec 6.2). */
  outlined?: boolean;
  /**
   * Placing the spa instead of a pin (Edit Pool Shape): what the drawing is called, and its
   * nudges, so VoiceOver and TalkBack users move it with Move Left / Right / Up / Down.
   */
  placing?: {
    label: string;
    hint: string;
    value: string;
    onMove: (dx: number, dy: number) => void;
  };
}) {
  const d = poolDiagram(shape, hasSpa, parseDiagramLayout(layout));
  const [width, setWidth] = useState(0);
  const height = (width * d.height) / d.width;

  const surface = useRef<View>(null);
  function place(e: GestureResponderEvent) {
    if (!onPlace || width === 0) return;
    const put = (lx: number, ly: number) => {
      if (!Number.isFinite(lx) || !Number.isFinite(ly)) return;
      const x = Math.min(Math.max(lx / width, 0), 1);
      const y = Math.min(Math.max(ly / height, 0), 1);
      onPlace(Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000);
    };
    const { locationX, locationY, pageX, pageY } = e.nativeEvent;
    if (Number.isFinite(locationX) && Number.isFinite(locationY)) return put(locationX, locationY);
    // Some presses come without a position in the view (the browser build): measure it.
    surface.current?.measure((_x, _y, _w, _h, left, top) => put(pageX - left, pageY - top));
  }

  // VoiceOver can't aim a tap on the drawing (design review M6): the diagram reads as one
  // element that names its pins, and double-tapping drops the pin in the middle; the finding's
  // location field then says where it is.
  // Numbered pins read "Pin 1"; in the editor, "!" is this finding and unlabelled pins are others.
  const pinName = (label: string) =>
    label === "!" ? "This finding’s pin" : label ? `Pin ${label}` : "Another finding’s pin";
  const pinSummary = pins.length ? pins.map((p) => pinName(p.label)).join(", ") : "No pins";
  const noSwipe = useNoSwipe();

  return (
    <View
      style={[
        styles.frame,
        { backgroundColor: color.surface },
        outlined && { borderWidth: 1, borderColor: color.controlBorder, maxWidth: 448 },
      ]}
      {...(onPlace ? noSwipe : null)}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible={!onPlace}
      accessibilityLabel={onPlace ? undefined : title}
      accessibilityValue={onPlace ? undefined : { text: pinSummary }}
    >
      {width > 0 ? (
        <Pressable
          ref={surface}
          onPress={place}
          disabled={!onPlace}
          style={{ width, height }}
          accessible={!!onPlace}
          accessibilityRole="button"
          accessibilityLabel={placing?.label ?? "Pool diagram. Tap where the leak is."}
          accessibilityValue={{ text: placing?.value ?? pinSummary }}
          accessibilityHint={
            placing?.hint ??
            "Double-tap to place the pin in the middle, then describe where it is in the location field."
          }
          accessibilityActions={
            placing ? MOVES.map(({ name, label }) => ({ name, label })) : undefined
          }
          onAccessibilityAction={
            placing
              ? (e) => {
                  const m = MOVES.find((x) => x.name === e.nativeEvent.actionName);
                  if (m) placing.onMove(m.dx, m.dy);
                }
              : undefined
          }
          onAccessibilityTap={onPlace && !placing ? () => onPlace(0.5, 0.5) : undefined}
        >
          <Svg
            width={width}
            height={height}
            viewBox={`0 0 ${d.width} ${d.height}`}
            pointerEvents="none"
          >
            <DiagramShapes d={d} />
            {pins.map((p) => (
              <Pin key={p.id} pin={p} x={p.x * d.width} y={p.y * d.height} />
            ))}
          </Svg>
          {markup.length ? (
            <MarkupLayer
              shapes={markup}
              width={width}
              height={height}
              space={DIAGRAM_MARKUP_SPACE}
            />
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Where a landmark's 24 x 24 drawing goes: its size box on its center; flipped, mirrored left
 * to right, or top to bottom for a landmark the same both ways across (the steps: `mirror` "y",
 * owner 2026-10-20), as the website's landmarkTransform.
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
 * A landmark's drawing (owner, 2026-10-19: "hard to interpret"), as the website's LandmarkArt:
 * filled parts in their color.landmark tones with a thin dark outline; water streaks ("foam")
 * as white lines. In a 24 x 24 box.
 */
export function LandmarkArt({ parts, transform }: { parts: LandmarkPart[]; transform?: string }) {
  const tone = tokens.color.landmark;
  return (
    <G transform={transform} strokeLinecap="round" strokeLinejoin="round">
      {parts.map((p, i) =>
        p.tone === "foam" ? (
          <Path key={i} d={p.d} fill="none" stroke={tone.foam} strokeWidth={1.4} />
        ) : (
          <Path key={i} d={p.d} fill={tone[p.tone]} stroke={tone.outline} strokeWidth={1} />
        ),
      )}
    </G>
  );
}

/**
 * The pool, what was drawn on it, its landmarks, and the spa, as the website's DiagramShapes
 * (apps/web/src/components/pool-diagram.tsx), in the diagram's 160 x 100 units.
 */
export function DiagramShapes({ d }: { d: Drawing }) {
  return (
    <>
      {d.pool ? (
        <Path d={d.pool} fill={color.diagramWater} stroke={color.water} strokeWidth={2} />
      ) : null}
      {/* Drawn with Draw, in the pool's outline (owner, 2026-10-19). */}
      {d.drawing.map((path, i) => (
        <Path
          key={`draw-${i}`}
          d={path}
          fill="none"
          stroke={color.water}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {d.landmarks.map((l, i) => (
        <LandmarkArt key={`landmark-${i}`} parts={l.parts} transform={landmarkTransform(l)} />
      ))}
      {d.spa ? (
        d.spa.square ? (
          <Rect
            x={d.spa.cx - d.spa.r}
            y={d.spa.cy - d.spa.r}
            width={d.spa.r * 2}
            height={d.spa.r * 2}
            rx={4}
            fill={color.diagramWater}
            stroke={color.water}
            strokeWidth={2}
          />
        ) : (
          <Circle
            cx={d.spa.cx}
            cy={d.spa.cy}
            r={d.spa.r}
            fill={color.diagramWater}
            stroke={color.water}
            strokeWidth={2}
          />
        )
      ) : null}
      {d.spa ? (
        <SvgText
          x={d.spa.cx}
          y={d.spa.cy + 3}
          fontSize={7}
          fill={color.water}
          textAnchor="middle"
          fontFamily={font.displayBold}
        >
          SPA
        </SvgText>
      ) : null}
    </>
  );
}

/** The spa's nudges for screen readers: 2% of the drawing a step, as the website's arrow keys. */
const MOVES = [
  { name: "moveLeft", label: "Move Left", dx: -0.02, dy: 0 },
  { name: "moveRight", label: "Move Right", dx: 0.02, dy: 0 },
  { name: "moveUp", label: "Move Up", dx: 0, dy: -0.02 },
  { name: "moveDown", label: "Move Down", dx: 0, dy: 0.02 },
];

function Pin({ pin, x, y }: { pin: DiagramPin; x: number; y: number }) {
  const r = pin.active ? 7 : 6;
  return (
    <>
      <Circle cx={x} cy={y} r={r + 1.5} fill={color.surface} />
      <Circle cx={x} cy={y} r={r} fill={pin.color} />
      <SvgText
        x={x}
        y={y + 2.6}
        fontSize={7}
        fill={color.paper}
        textAnchor="middle"
        fontFamily={font.displayBold}
      >
        {pin.label}
      </SvgText>
    </>
  );
}

const styles = StyleSheet.create({
  // A plain white panel on the grouped gray (spec 3.18), no outline.
  frame: { width: "100%", borderRadius: 12, overflow: "hidden" },
});
