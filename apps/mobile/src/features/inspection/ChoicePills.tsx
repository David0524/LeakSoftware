import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ChoiceOption } from "@leakbook/core";
import { haptics } from "../../ui/haptics";
import { color, face, MAX_TEXT_SCALE, minTap, shape, space, type } from "../../ui/theme";

// Pool Inspection's answers (2026-10-20), as the website's pills: a 44 pt capsule per option
// that wraps onto more lines. One answer (radio, tap the chosen one again to clear) takes its
// option's flag color; several (tap all that apply) fill with the primary color.

/** The color a chosen option fills with, from its flag. */
function selectedColor(flag: ChoiceOption["flag"]): string {
  return flag === "ok"
    ? color.pass
    : flag === "attention"
      ? color.warning
      : flag === "leaking"
        ? color.fail
        : flag === "na"
          ? color.excluded
          : color.primary;
}

function ChoicePill({
  label,
  on,
  fill,
  role,
  onPress,
}: {
  label: string;
  on: boolean;
  fill: string;
  role: "radio" | "checkbox";
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      android_ripple={{ color: color.ripple }}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: on ? fill : color.fill },
        pressed && !on && { opacity: 0.7 },
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: on ? (fill === color.primary ? color.onPrimary : color.onStatus) : color.text },
        ]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** One answer: the chosen option in its flag's color; tapping it again clears it. */
export function ChoicePills({
  label,
  options,
  value,
  onChange,
}: {
  /** The question, for screen readers. */
  label: string;
  options: ChoiceOption[];
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.wrap}>
      {options.map((o) => {
        const on = value === o.label;
        return (
          <ChoicePill
            key={o.label}
            label={o.label}
            on={on}
            fill={selectedColor(o.flag)}
            role="radio"
            onPress={() => onChange(on ? null : o.label)}
          />
        );
      })}
    </View>
  );
}

/** Tap all that apply: each option is a pill that fills when on. */
export function ChipToggles({
  label,
  options,
  value,
  onToggle,
}: {
  /** The question, for screen readers. */
  label: string;
  options: string[];
  value: string[];
  onToggle: (option: string) => void;
}) {
  return (
    <View accessible={false} accessibilityLabel={label} style={styles.wrap}>
      {options.map((o) => (
        <ChoicePill
          key={o}
          label={o}
          on={value.includes(o)}
          fill={color.primary}
          role="checkbox"
          onPress={() => onToggle(o)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space["2"] },
  pill: {
    minHeight: minTap,
    borderRadius: shape.pill,
    paddingHorizontal: space["4"],
    justifyContent: "center",
  },
  text: { ...type.secondary, ...face.semiBold },
});
