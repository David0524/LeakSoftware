import { StyleSheet, Text, View } from "react-native";
import { techColor } from "@leakbook/core";
import { color, MAX_TEXT_SCALE, space, type } from "./theme";

// A tech's color (owner, 2026-10-20; docs/design/2026-10-20-team-week.md section 3): a 10 pt
// dot before their name everywhere a tech is named, and a 4 pt stripe on the leading edge of
// their Schedule and Week cards. A color is never the only cue: the name is always beside it,
// and TalkBack reads the name, so the dot is hidden from it.

/** A tech's color in the current appearance, from their membership's palette key. */
export function techHex(key: string | null | undefined): string {
  return color.tech[techColor(key)];
}

export function TechDot({
  tech,
  size = 10,
  ring,
}: {
  /** The membership's color key (null: Slate). */
  tech: string | null | undefined;
  size?: number;
  /** A ring around it, on a filled pill where the dot sits on blue. */
  ring?: string;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: techHex(tech),
        },
        ring ? { borderWidth: 1.5, borderColor: ring } : null,
      ]}
    />
  );
}

/** A row's value naming a tech: their dot, then the name in the muted color (Job › Tech). */
export function TechValue({ name, tech }: { name: string; tech: string | null | undefined }) {
  return (
    <View style={styles.value}>
      <TechDot tech={tech} />
      <Text
        style={[type.body, { color: color.textMuted, flexShrink: 1, textAlign: "right" }]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
      >
        {name}
      </Text>
    </View>
  );
}

/** The 4 pt stripe on a card's leading edge, in the tech's color. */
export function TechStripe({ tech }: { tech: string | null | undefined }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.stripe, { backgroundColor: techHex(tech) }]}
    />
  );
}

const styles = StyleSheet.create({
  dot: { flexShrink: 0 },
  value: { flexDirection: "row", alignItems: "center", gap: space["2"], flexShrink: 1 },
  stripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
});
