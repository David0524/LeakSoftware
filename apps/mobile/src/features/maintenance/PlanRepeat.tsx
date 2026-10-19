import type { PlanRepeat as Repeat } from "@leakbook/core";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Segmented, T } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { Select } from "../../ui/Select";
import { color, face, minTap, space, type } from "../../ui/theme";
import { REPEAT_OPTIONS } from "./plan";

const DAYS = [
  { value: 1, short: "M", name: "Monday" },
  { value: 2, short: "T", name: "Tuesday" },
  { value: 3, short: "W", name: "Wednesday" },
  { value: 4, short: "T", name: "Thursday" },
  { value: 5, short: "F", name: "Friday" },
  { value: 6, short: "S", name: "Saturday" },
  { value: 0, short: "S", name: "Sunday" },
];

/**
 * How often a plan repeats (the website's PlanRepeat): a segmented control, and for Several
 * Days the days as a row of round toggles (as in iOS Reminders' custom repeat). With `once`
 * (New Job), a menu with Just once first ("0"), since five choices don't fit a phone's row.
 */
export function PlanRepeat<V extends Repeat | "0">({
  value,
  onChange,
  days,
  onDaysChange,
  once = false,
  error,
}: {
  value: V;
  onChange: (v: V) => void;
  days: number[];
  onDaysChange: (days: number[]) => void;
  once?: boolean;
  /** "Pick two or more days." */
  error?: string;
}) {
  return (
    <View style={{ gap: space["3"] }}>
      {once ? (
        <Select
          label="Repeats"
          value={value}
          onChange={onChange}
          options={
            [{ value: "0", label: "Just once" }, ...REPEAT_OPTIONS] as { value: V; label: string }[]
          }
          style={{ maxWidth: 320 }}
        />
      ) : (
        // Four longer labels: 13 pt on one row, as the website's `fit` control (iOS never
        // wraps a segmented control onto two rows).
        <Segmented
          label="Repeats"
          variant="switcher"
          value={value}
          onChange={onChange}
          options={REPEAT_OPTIONS as { value: V; label: string }[]}
        />
      )}
      {value === "days" ? (
        <View style={{ gap: space["1"] }}>
          <T variant="bodyMedium">Days</T>
          <View style={styles.days} accessibilityLabel="Days">
            {DAYS.map((d) => {
              const on = days.includes(d.value);
              return (
                <Pressable
                  key={d.value}
                  accessibilityRole="checkbox"
                  accessibilityLabel={d.name}
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    haptics.selection();
                    onDaysChange(on ? days.filter((x) => x !== d.value) : [...days, d.value]);
                  }}
                  android_ripple={{ color: color.ripple, borderless: true }}
                  style={({ pressed }) => [
                    styles.day,
                    { backgroundColor: on ? color.primary : color.fill },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    style={[type.body, face.semiBold, { color: on ? color.onPrimary : color.text }]}
                    maxFontSizeMultiplier={1.4}
                  >
                    {d.short}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {error ? (
            <T variant="secondary" style={{ color: color.fail }}>
              {error}
            </T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  days: { flexDirection: "row", gap: space["1"] },
  // Seven across, sharing the row; at most 44 wide.
  day: {
    flex: 1,
    maxWidth: minTap,
    height: minTap,
    borderRadius: minTap / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
