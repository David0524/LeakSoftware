import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { addMonths, dateFormat, formatDay, monthGrid } from "@leakbook/core";
import { Card, RoundButton, T } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { color, face, font, MAX_TEXT_SCALE, space } from "../../ui/theme";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthName = dateFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** "October 2026" for any day of that month. */
export function monthTitle(date: string): string {
  return monthName.format(new Date(`${date.slice(0, 8)}01T12:00:00Z`));
}

function rows(days: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
  return out;
}

/**
 * Schedule › Month (spec 5.6): each day's jobs and cleanings for the chosen tech (or
 * everyone); a day opens its route.
 */
export function MonthCalendar({
  days,
  month,
  today,
  counts,
  onPick,
}: {
  days: string[];
  /** "2026-10" */
  month: string;
  today: string;
  counts: Record<string, { jobs: number; cleanings: number }>;
  onPick: (date: string) => void;
}) {
  return (
    <Card padding={space["2"]}>
      <View style={styles.weekdays} importantForAccessibility="no-hide-descendants">
        {WEEKDAYS.map((d) => (
          <T key={d} variant="footnote" muted style={[styles.cellText, face.semiBold]}>
            {d}
          </T>
        ))}
      </View>
      <View style={{ gap: 4 }}>
        {rows(days).map((week) => (
          <View key={week[0]} style={styles.week}>
            {week.map((d) => {
              const c = counts[d] ?? { jobs: 0, cleanings: 0 };
              const label = [
                formatDay(d, "long"),
                c.jobs ? `${c.jobs} ${c.jobs === 1 ? "job" : "jobs"}` : null,
                c.cleanings
                  ? `${c.cleanings} ${c.cleanings === 1 ? "cleaning" : "cleanings"}`
                  : null,
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  onPress={() => onPick(d)}
                  style={({ pressed }) => [
                    styles.monthCell,
                    !d.startsWith(month) && { opacity: 0.4 },
                    d === today && { borderWidth: 2, borderColor: color.link },
                    pressed && { backgroundColor: color.bg },
                  ]}
                >
                  <Text
                    style={[styles.monthNum, { color: color.text }]}
                    maxFontSizeMultiplier={1.6}
                  >
                    {Number(d.slice(8))}
                  </Text>
                  {c.jobs ? (
                    <Text
                      style={[styles.small, face.semiBold, { color: color.text }]}
                      maxFontSizeMultiplier={1.4}
                    >
                      {c.jobs} {c.jobs === 1 ? "job" : "jobs"}
                    </Text>
                  ) : null}
                  {c.cleanings ? (
                    <Text
                      style={[styles.small, face.regular, { color: color.textMuted }]}
                      maxFontSizeMultiplier={1.4}
                    >
                      {c.cleanings} clean
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </Card>
  );
}

/**
 * Picking a date (Go to Date, a move's Day): the month with the chosen day filled, and the
 * months before and after. Days before `min` can't be picked.
 */
export function DatePicker({
  value,
  today,
  min,
  onChange,
}: {
  value: string;
  today: string;
  min?: string;
  onChange: (date: string) => void;
}) {
  const [month, setMonth] = useState(value.slice(0, 7));
  const days = monthGrid(`${month}-01`);
  return (
    <View style={{ gap: space["2"] }}>
      <View style={styles.pickerHead}>
        <T variant="subHeading" style={{ flex: 1 }}>
          {monthTitle(`${month}-01`)}
        </T>
        <RoundButton
          icon="back"
          label="Previous month"
          onPress={() => setMonth(addMonths(`${month}-01`, -1).slice(0, 7))}
        />
        <RoundButton
          icon="forward"
          label="Next month"
          onPress={() => setMonth(addMonths(`${month}-01`, 1).slice(0, 7))}
        />
      </View>
      <View style={styles.weekdays} importantForAccessibility="no-hide-descendants">
        {WEEKDAYS.map((d) => (
          <T key={d} variant="footnote" muted style={[styles.cellText, face.semiBold]}>
            {d}
          </T>
        ))}
      </View>
      <View style={{ gap: 4 }}>
        {rows(days).map((week) => (
          <View key={week[0]} style={styles.week}>
            {week.map((d) => {
              const out = !d.startsWith(month);
              const blocked = Boolean(min && d < min);
              const chosen = d === value;
              return (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityLabel={formatDay(d, "long")}
                  accessibilityState={{ selected: chosen, disabled: blocked }}
                  disabled={blocked}
                  onPress={() => {
                    haptics.selection();
                    onChange(d);
                  }}
                  style={[
                    styles.pickCell,
                    chosen && { backgroundColor: color.text },
                    (out || blocked) && !chosen && { opacity: 0.35 },
                  ]}
                >
                  <Text
                    style={[
                      styles.pickNum,
                      { color: chosen ? color.bg : d === today ? color.link : color.text },
                    ]}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  >
                    {Number(d.slice(8))}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  weekdays: { flexDirection: "row", paddingVertical: 4 },
  cellText: { flex: 1, textAlign: "center" },
  week: { flexDirection: "row", gap: 4 },
  monthCell: {
    flex: 1,
    minHeight: 64,
    borderRadius: 10,
    alignItems: "center",
    padding: 4,
  },
  monthNum: { fontFamily: font.displayBold, fontSize: 18, lineHeight: 24 },
  small: { fontSize: 13, lineHeight: 16, textAlign: "center" },
  pickerHead: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  pickCell: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  pickNum: { fontFamily: font.displayBold, fontSize: 18 },
});
