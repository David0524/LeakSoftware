import { StyleSheet, View } from "react-native";
import type { Outcome } from "@leakbook/core";
import { T } from "../../ui/components";
import { color, font, radius } from "../../ui/theme";

export const OUTCOME_STYLE: Record<Outcome, { label: string; bg: string }> = {
  pass: { label: "Pass", bg: color.pass },
  fail: { label: "Fail", bg: color.fail },
  inconclusive: { label: "Unclear", bg: color.warning },
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
  // A pill like every other status label (M11 review M9).
  chip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  text: { fontFamily: font.bodySemiBold, fontSize: 13, color: color.onHeader },
});
