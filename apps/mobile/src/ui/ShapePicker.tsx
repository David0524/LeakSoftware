import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { DIAGRAM_SHAPES, poolDiagram, type DiagramShape } from "@leakbook/core";
import { T } from "./components";
import { color, radius, space } from "./theme";

/**
 * The pool's shape as five small drawings to tap (owner, 2026-10-14: a list of shape names
 * was easy to miss). Used on New Job and above the diagram on Findings.
 */
export function ShapePicker({
  value,
  onChange,
  label = "Pool shape",
}: {
  value: DiagramShape;
  onChange: (shape: DiagramShape) => void;
  label?: string;
}) {
  return (
    <View style={{ gap: space["1"] }}>
      <T variant="label">{label}</T>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.row}>
        {DIAGRAM_SHAPES.map((s) => {
          const d = poolDiagram(s.key, false);
          const on = value === s.key;
          return (
            <Pressable
              key={s.key}
              accessibilityRole="radio"
              accessibilityLabel={s.label}
              accessibilityState={{ checked: on }}
              onPress={() => onChange(s.key)}
              style={({ pressed }) => [
                styles.tile,
                on && styles.tileOn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Svg width="100%" height={30} viewBox={`0 0 ${d.width} ${d.height}`}>
                <Path d={d.pool} fill={color.diagramWater} stroke={color.water} strokeWidth={5} />
              </Svg>
              <T
                variant="small"
                numberOfLines={1}
                style={[styles.text, on && { color: color.link }]}
              >
                {s.label}
              </T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space["2"] },
  tile: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    gap: 2,
    paddingTop: space["1"],
    paddingBottom: space["1"],
    paddingHorizontal: 2,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: color.surface,
  },
  tileOn: { borderColor: color.link },
  text: { fontSize: 12, lineHeight: 16, letterSpacing: -0.2 },
});
