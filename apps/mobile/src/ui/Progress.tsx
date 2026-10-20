import { ActivityIndicator, StyleSheet, View } from "react-native";
import { T } from "./components";
import { color, space } from "./theme";
import { WebIcon } from "./WebIcon";

// Progress while the app waits on the server (owner, 2026-10-20: "It is a long white screen
// when loading. We need to keep users engaged during that loading time"): the steps of the
// wait, each checked off as it finishes, instead of a blank or a bare spinner.

/** "Saving your work" → "Writing the report" → "Getting it ready". */
export function StepList({
  steps,
  at,
  label,
}: {
  steps: readonly string[];
  /** The step under way (steps before it are done). */
  at: number;
  /** Read once for screen readers ("Writing the draft"). */
  label?: string;
}) {
  return (
    <View
      style={styles.list}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: steps.length, now: at, text: steps[at] ?? steps.at(-1) }}
      accessibilityLiveRegion="polite"
    >
      {steps.map((s, i) => {
        const done = i < at;
        const active = i === at;
        return (
          <View key={s} style={styles.step}>
            <View style={styles.mark}>
              {done ? (
                <View style={[styles.dot, { backgroundColor: color.pass }]}>
                  <WebIcon name="check" size={14} color="#FFFFFF" strokeWidth={3} />
                </View>
              ) : active ? (
                <ActivityIndicator size="small" color={color.link} />
              ) : (
                <View style={[styles.dot, styles.todo, { borderColor: color.separator }]} />
              )}
            </View>
            <T variant={active ? "bodyEmphasis" : "body"} muted={!done && !active}>
              {s}
            </T>
          </View>
        );
      })}
    </View>
  );
}

/** A thin bar for a download; with no total yet it shows a short sliver. */
export function ProgressBar({ value, label }: { value: number | null; label: string }) {
  const pct = value == null ? 0.06 : Math.max(0.04, Math.min(1, value));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={
        value == null ? { text: "Waiting" } : { min: 0, max: 100, now: Math.round(pct * 100) }
      }
      style={[styles.track, { backgroundColor: color.fill }]}
    >
      <View style={[styles.bar, { width: `${pct * 100}%`, backgroundColor: color.link }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space["2"] },
  step: { flexDirection: "row", alignItems: "center", gap: space["3"], minHeight: 28 },
  mark: { width: 22, alignItems: "center" },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  todo: { borderWidth: 1.5 },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  bar: { height: 6, borderRadius: 3 },
});
