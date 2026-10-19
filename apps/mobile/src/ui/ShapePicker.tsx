import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { DIAGRAM_SHAPES, poolDiagram, type DiagramShape } from "@leakbook/core";
import { T } from "./components";
import { color, face, minTap, shape, space } from "./theme";

/**
 * The pool’s shape as small drawings (eight since 2026-10-19) to tap (owner, 2026-10-14: a list of shape names
 * was easy to miss), drawn as the website's tiles (spec 3.18): about 64 wide, radius 16, gray
 * fill; the chosen one tinted with a 2 pt link ring. Used on New Job and in the finding sheet.
 * The shape can stay blank; tapping the picked shape again clears it.
 */
export function ShapePicker({
  value,
  onChange,
  label = "Pool shape",
  hint,
  disabled = false,
}: {
  value: DiagramShape | null;
  onChange: (shape: DiagramShape | null) => void;
  label?: string;
  /** A line under the label, e.g. that it can be set later. */
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: space["1"] }}>
      <T variant="bodyMedium">{label}</T>
      {hint ? (
        <T variant="secondary" muted>
          {hint}
        </T>
      ) : null}
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.row}>
        {DIAGRAM_SHAPES.map((s) => {
          const d = poolDiagram(s.key, false);
          const on = value === s.key;
          return (
            <Pressable
              key={s.key}
              accessibilityRole="radio"
              accessibilityLabel={s.label}
              accessibilityState={{ checked: on, disabled }}
              accessibilityHint={on ? "Tap again to clear" : undefined}
              disabled={disabled}
              onPress={() => onChange(on ? null : s.key)}
              style={({ pressed }) => [
                styles.tile,
                on
                  ? { backgroundColor: color.tinted, borderColor: color.link }
                  : { backgroundColor: color.fill, borderColor: "transparent" },
                pressed && { opacity: 0.8 },
                disabled && { opacity: 0.6 },
              ]}
            >
              <Svg width="100%" height={30} viewBox={`0 0 ${d.width} ${d.height}`}>
                <Path d={d.pool} fill={color.diagramWater} stroke={color.water} strokeWidth={5} />
              </Svg>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                maxFontSizeMultiplier={1.4}
                style={[
                  styles.text,
                  on ? [face.semiBold, { color: color.link }] : { color: color.text },
                ]}
              >
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 },
  tile: {
    width: 64,
    minHeight: minTap,
    alignItems: "center",
    gap: space["1"],
    paddingTop: 6,
    paddingBottom: space["1"],
    paddingHorizontal: 1,
    borderRadius: shape.block,
    borderWidth: 2,
  },
  text: { ...face.medium, fontSize: 12, lineHeight: 15, letterSpacing: -0.2 },
});
