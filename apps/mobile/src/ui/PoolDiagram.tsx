import { useState } from "react";
import { Pressable, StyleSheet, View, type GestureResponderEvent } from "react-native";
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";
import { poolDiagram, type DiagramShape } from "@leakbook/core";
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
  pins,
  onPlace,
}: {
  shape: DiagramShape | null | undefined;
  hasSpa: boolean;
  pins: DiagramPin[];
  onPlace?: (x: number, y: number) => void;
}) {
  const d = poolDiagram(shape, hasSpa);
  const [width, setWidth] = useState(0);
  const height = (width * d.height) / d.width;

  function place(e: GestureResponderEvent) {
    if (!onPlace || width === 0) return;
    const x = Math.min(Math.max(e.nativeEvent.locationX / width, 0), 1);
    const y = Math.min(Math.max(e.nativeEvent.locationY / height, 0), 1);
    onPlace(Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000);
  }

  return (
    <View
      style={styles.frame}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityLabel={
        onPlace ? "Pool diagram. Tap where the leak is." : "Pool diagram with finding pins"
      }
    >
      {width > 0 ? (
        <Pressable onPress={place} disabled={!onPlace} style={{ width, height }}>
          <Svg
            width={width}
            height={height}
            viewBox={`0 0 ${d.width} ${d.height}`}
            pointerEvents="none"
          >
            <Path d={d.pool} fill={color.diagramWater} stroke={color.water} strokeWidth={2} />
            {d.spa ? (
              <Circle
                cx={d.spa.cx}
                cy={d.spa.cy}
                r={d.spa.r}
                fill={color.diagramWater}
                stroke={color.water}
                strokeWidth={2}
              />
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
        fill={color.onHeader}
        textAnchor="middle"
        fontFamily={font.displayBold}
      >
        {pin.label}
      </SvgText>
    </>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    backgroundColor: color.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.border,
    overflow: "hidden",
  },
});
