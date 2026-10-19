import { useState } from "react";
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
}) {
  const d = poolDiagram(shape, hasSpa, parseDiagramLayout(layout));
  const [width, setWidth] = useState(0);
  const height = (width * d.height) / d.width;

  function place(e: GestureResponderEvent) {
    if (!onPlace || width === 0) return;
    const x = Math.min(Math.max(e.nativeEvent.locationX / width, 0), 1);
    const y = Math.min(Math.max(e.nativeEvent.locationY / height, 0), 1);
    onPlace(Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000);
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
          onPress={place}
          disabled={!onPlace}
          style={{ width, height }}
          accessible={!!onPlace}
          accessibilityRole="button"
          accessibilityLabel="Pool diagram. Tap where the leak is."
          accessibilityValue={{ text: pinSummary }}
          accessibilityHint="Double-tap to place the pin in the middle, then describe where it is in the location field."
          onAccessibilityTap={onPlace ? () => onPlace(0.5, 0.5) : undefined}
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
