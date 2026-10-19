import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useEffect, useState } from "react";
import { appearance, color, glassShadow, ios } from "./theme";

/** Reduce Transparency (iOS): glass turns solid. */
function useReduceTransparency(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!ios) return;
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setOn);
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setOn);
    return () => sub.remove();
  }, []);
  return on;
}

/**
 * The floating glass layer (spec 2.5): the tab bar and action sheet panels. iPhone: a blur
 * under the surface at 72%, a 1 pt border and a soft shadow. Android and the browser preview:
 * no blur, the surface at 96% with the same border and shadow. Content never sits on glass.
 * `bar` is the navigation bar's variant: bg at 88% with a hairline along the bottom, no shadow.
 */
export function Glass({
  children,
  style,
  variant = "float",
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: "float" | "bar";
}) {
  const solid = useReduceTransparency();
  const bar = variant === "bar";
  const blur = ios && !solid;
  const corner = StyleSheet.flatten(style)?.borderRadius;
  const fill = solid
    ? bar
      ? color.bg
      : color.surface
    : bar
      ? blur
        ? color.bar
        : color.barSolid
      : blur
        ? color.glass
        : color.glassSolid;
  return (
    <View
      style={[
        bar ? styles.bar : [styles.float, glassShadow()],
        bar
          ? { borderBottomColor: color.separator }
          : { borderColor: solid ? color.controlBorder : color.glassBorder },
        style,
      ]}
    >
      <View style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: corner }]}>
        {blur ? (
          <BlurView
            intensity={60}
            tint={appearance.scheme === "dark" ? "systemMaterialDark" : "systemMaterial"}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  float: { borderWidth: 1 },
  bar: { borderBottomWidth: StyleSheet.hairlineWidth },
  clip: { overflow: "hidden" },
});
