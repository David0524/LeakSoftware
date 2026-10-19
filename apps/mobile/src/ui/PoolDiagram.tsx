import { useRef, useState } from "react";
import { Pressable, StyleSheet, View, type GestureResponderEvent } from "react-native";
import Svg, { Circle, Path, Rect, Text as SvgText } from "react-native-svg";
import { parseDiagramLayout, poolDiagram, type DiagramShape } from "@leakbook/core";
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

  return (
    <View
      style={[
        styles.frame,
        { backgroundColor: color.surface },
        outlined && { borderWidth: 1, borderColor: color.controlBorder, maxWidth: 448 },
      ]}
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
            <Path d={d.pool} fill={color.diagramWater} stroke={color.water} strokeWidth={2} />
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
            {pins.map((p) => (
              <Pin key={p.id} pin={p} x={p.x * d.width} y={p.y * d.height} />
            ))}
          </Svg>
        </Pressable>
      ) : null}
    </View>
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
