import { StyleSheet, View } from "react-native";
import type { Outcome } from "@leakbook/core";
import { T } from "../../ui/components";
import { color, font, radius } from "../../ui/theme";

export const OUTCOME_STYLE: Record<Outcome, { label: string; bg: string }> = {
  pass: { label: "PASS", bg: color.pass },
  fail: { label: "FAIL", bg: color.fail },
  inconclusive: { label: "UNCLEAR", bg: color.warning },
};

export function OutcomeChip({ outcome }: { outcome?: Outcome | null }) {
  if (!outcome) return null;
  const s = OUTCOME_STYLE[outcome];
  return (
    <View style={[styles.chip, { backgroundColor: s.bg }]}>
      <T variant="small" style={styles.text}>
        {s.label}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  text: { fontFamily: font.displayBold, fontSize: 12, letterSpacing: 0.6, color: color.onHeader },
});
