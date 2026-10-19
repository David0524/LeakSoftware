import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import {
  ACID_PRODUCTS,
  CHLORINE_PRODUCTS,
  calculateChemistry,
  doseSummary,
  targets,
  type AcidProduct,
  type ChemistryResult,
  type ChlorineProduct,
  type ReadingKey,
  type Readings,
} from "@leakbook/core";
import { useTabBarTop } from "../../../../features/messages/Composer";
import { getServices } from "../../../../lib/services";
import { Card, Screen, T } from "../../../../ui/components";
import { Glass } from "../../../../ui/Glass";
import { ModalSheet } from "../../../../ui/ModalSheet";
import { Select } from "../../../../ui/Select";
import { ScreenTip } from "../../../../ui/Tip";
import {
  color,
  face,
  font,
  MAX_TEXT_SCALE,
  minTap,
  shape,
  space,
  tabular,
  tint,
  type,
} from "../../../../ui/theme";

// The pool chemical calculator (spec 5.11; owner, 2026-10-16): the pool's size and today's
// readings in, what to add out, in order. Readings fill the screen; What to Add is a glass bar
// floating above the tab bar that opens a sheet. Nothing is saved but the levels a tech aims
// for. The math is packages/core/src/chemistry.ts. A visit opens it with the pool's gallons.

const num = (v: string) => {
  const n = Number(v.replace(/,/g, ""));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

/** Gallons with thousands commas as they're typed: "20000" shows as "20,000". */
function withCommas(text: string): string {
  const digits = text
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, 7);
  return digits ? Number(digits).toLocaleString("en-US") : "";
}

// Every pool gets the same readings and targets; salt is left blank on a chlorine pool
// (owner, 2026-10-18).
const READINGS: { key: keyof Readings; label: string; hint: string }[] = [
  { key: "fc", label: "Free Chlorine", hint: "ppm" },
  { key: "ph", label: "pH", hint: "" },
  { key: "ta", label: "Alkalinity", hint: "ppm" },
  { key: "ch", label: "Calcium", hint: "ppm" },
  { key: "cya", label: "Stabilizer (CYA)", hint: "ppm" },
  { key: "salt", label: "Salt", hint: "ppm" },
];

/** Where this phone remembers the levels the tech aims for. */
const GOALS_KEY = "chemicals:goals";

function savedGoals(): Record<string, string> {
  try {
    const saved = JSON.parse(getServices().kv.get(GOALS_KEY) ?? "{}");
    return saved && typeof saved === "object" ? (saved as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** A number box in the outlined field style. */
function Cell({ style, ...input }: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      keyboardType="decimal-pad"
      placeholderTextColor={color.placeholder}
      maxFontSizeMultiplier={MAX_TEXT_SCALE}
      {...input}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.cell,
        type.body,
        tabular,
        { borderColor: color.controlBorder, backgroundColor: color.surface, color: color.text },
        focused && { borderColor: color.focus, borderWidth: 2 },
        style,
      ]}
    />
  );
}

export default function Chemicals() {
  const params = useLocalSearchParams<{ gallons?: string }>();
  const [gallonsText, setGallonsText] = useState(
    Number(params.gallons) > 0 ? withCommas(String(Math.round(Number(params.gallons)))) : "",
  );
  const [sheet, setSheet] = useState(false);
  const barTop = useTabBarTop();
  const [values, setValues] = useState<Record<string, string>>({});
  // Levels to aim for instead of the recommended ones (owner, 2026-10-18: "chlorine won't
  // always be 4"). Blank uses the recommended level; the phone remembers the rest.
  const [goals, setGoalsState] = useState<Record<string, string>>(savedGoals);
  const setGoals = (next: Record<string, string>) => {
    setGoalsState(next);
    getServices().kv.set(GOALS_KEY, JSON.stringify(next));
  };
  const [chlorine, setChlorine] = useState<ChlorineProduct>("liquid12");
  const [acid, setAcid] = useState<AcidProduct>("muriatic31");

  const gallons = num(gallonsText) ?? 0;
  const readings: Readings = Object.fromEntries(
    READINGS.map((r) => [r.key, num(values[r.key] ?? "")]),
  );
  const goalLevels = Object.fromEntries(Object.entries(goals).map(([k, v]) => [k, num(v)]));
  const recommended = targets(readings.cya);
  const result = calculateChemistry({ gallons, readings, chlorine, acid, goals: goalLevels });
  const anyGoal = Object.values(goalLevels).some((v) => v !== null);
  const ready = gallons > 0 && result.statuses.length > 0;
  const line = doseSummary(result, ready);

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Chemical Calculator">
        <ScreenTip screen="chemicals" />
        <Card style={{ gap: space["4"] }}>
          <T variant="cardTitle">Pool</T>
          <View style={{ gap: 4, maxWidth: 320 }}>
            <T variant="bodyMedium">Gallons</T>
            <View>
              <Cell
                accessibilityLabel="Gallons"
                keyboardType="number-pad"
                value={gallonsText}
                onChangeText={(v) => setGallonsText(withCommas(v))}
                placeholder="20,000"
                style={{ width: "100%", textAlign: "left", paddingRight: 56 }}
              />
              <Text
                style={[type.secondary, styles.unit, { color: color.textMuted }]}
                pointerEvents="none"
              >
                gal
              </Text>
            </View>
          </View>
        </Card>

        <Card style={{ gap: space["4"] }}>
          <T variant="cardTitle">Readings</T>
          <View style={{ gap: space["2"] }} accessibilityLabel="Readings and levels to aim for">
            <View style={styles.gridRow} importantForAccessibility="no-hide-descendants">
              <View style={{ flex: 1 }} />
              <Text style={[styles.colLabel, { color: color.textMuted }]}>Reading</Text>
              <Text style={[styles.colLabel, { color: color.textMuted }]}>Aim For</Text>
            </View>
            {READINGS.map((r) => {
              const target = recommended[r.key as ReadingKey]?.target;
              return (
                <View key={r.key} style={styles.gridRow}>
                  <Text
                    style={[type.bodyMedium, { color: color.text, flex: 1 }]}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  >
                    {r.label}
                    {r.hint ? (
                      <Text style={[type.secondary, { color: color.textMuted }]}> {r.hint}</Text>
                    ) : null}
                  </Text>
                  <Cell
                    accessibilityLabel={`${r.label} reading`}
                    value={values[r.key] ?? ""}
                    onChangeText={(v) => setValues({ ...values, [r.key]: v })}
                  />
                  {target != null ? (
                    <Cell
                      accessibilityLabel={`${r.label}: aim for (recommended ${target})`}
                      placeholder={String(target)}
                      value={goals[r.key] ?? ""}
                      onChangeText={(v) => setGoals({ ...goals, [r.key]: v })}
                    />
                  ) : (
                    <View style={styles.cellSpace} />
                  )}
                </View>
              );
            })}
          </View>
          <Text
            style={[type.secondary, { color: color.textMuted }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            Aim For starts at the recommended level. Type your own to dose to it.
            {anyGoal ? (
              <>
                {" "}
                <Text
                  accessibilityRole="button"
                  onPress={() => setGoals({})}
                  style={[face.semiBold, { color: color.link }]}
                >
                  Use Recommended
                </Text>
              </>
            ) : null}
          </Text>
          <Select
            label="Chlorine"
            value={chlorine}
            onChange={setChlorine}
            options={Object.entries(CHLORINE_PRODUCTS).map(([value, label]) => ({
              value: value as ChlorineProduct,
              label,
            }))}
          />
          <Select
            label="Acid"
            value={acid}
            onChange={setAcid}
            options={Object.entries(ACID_PRODUCTS).map(([value, label]) => ({
              value: value as AcidProduct,
              label,
            }))}
          />
        </Card>
        {/* Room to scroll the last fields clear of the floating bar. */}
        <View style={{ height: 72 }} />
      </Screen>

      <View style={[styles.dock, { bottom: barTop + space["2"] }]} pointerEvents="box-none">
        <Glass style={styles.bar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`What to Add: ${line}`}
            accessibilityState={{ disabled: !ready }}
            disabled={!ready}
            onPress={() => setSheet(true)}
            style={({ pressed }) => [styles.barInner, pressed && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.barLabel, { color: color.textMuted }]}>What to Add</Text>
              <Text
                numberOfLines={1}
                style={[type.bodyEmphasis, { color: ready ? color.text : color.textMuted }]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
              >
                {line}
              </Text>
            </View>
            {ready ? <Text style={[type.bodyEmphasis, { color: color.link }]}>Show</Text> : null}
          </Pressable>
        </Glass>
      </View>

      <ModalSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="What to Add"
        cancel="Close"
      >
        <Doses result={result} />
      </ModalSheet>
    </View>
  );
}

/** The readings as pills, the steps in order, and the saturation index. */
function Doses({ result }: { result: ChemistryResult }) {
  return (
    <>
      <View style={styles.pills} accessibilityLabel="Readings">
        {result.statuses.map((s) => {
          const tone = s.status === "ok" ? color.pass : color.warning;
          return (
            <View
              key={s.key}
              style={[
                styles.pill,
                { backgroundColor: color.surface, borderColor: tint(tone, 0.4) },
              ]}
            >
              <Text
                style={[type.secondary, face.semiBold, { color: tone }]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
              >
                {s.label} {s.key === "ph" ? s.value.toFixed(1) : s.value}
                <Text style={face.regular}>
                  {" "}
                  · {s.status === "ok" ? "OK" : s.status === "low" ? "Low" : "High"}
                </Text>
              </Text>
            </View>
          );
        })}
      </View>
      {result.steps.length === 0 ? (
        <T variant="bodyEmphasis" style={{ color: color.pass }}>
          Balanced. Nothing to add.
        </T>
      ) : (
        <View style={{ gap: space["3"] }}>
          {result.steps.map((s, i) => (
            <View key={s.key + s.product} style={[styles.step, { backgroundColor: color.surface }]}>
              <View
                style={[StyleSheet.absoluteFill, styles.stepFill, { backgroundColor: color.well }]}
              />
              <View style={[styles.stepNum, { backgroundColor: color.primary }]}>
                <Text style={[styles.stepNumText, { color: color.onPrimary }]}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                {s.measure ? (
                  <Text
                    style={[styles.measure, { color: color.text }]}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  >
                    {s.measure}
                  </Text>
                ) : null}
                <T variant="bodyEmphasis">{s.product}</T>
                {s.amount ? (
                  <T variant="secondary" muted style={tabular}>
                    About {s.amount}
                  </T>
                ) : null}
                <T variant="secondary" muted>
                  {s.why}
                </T>
                {s.note ? <T variant="secondary">{s.note}</T> : null}
              </View>
            </View>
          ))}
        </View>
      )}
      {result.lsi !== null ? (
        <Text
          style={[type.secondary, { color: color.text }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          Saturation index{" "}
          <Text style={[face.semiBold, tabular]}>
            {result.lsi > 0 ? "+" : ""}
            {result.lsi.toFixed(1)}
          </Text>{" "}
          · {result.lsiLabel}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  cell: {
    width: 80,
    minHeight: minTap,
    borderWidth: 1,
    borderRadius: shape.field,
    paddingHorizontal: 12,
    paddingVertical: 8,
    textAlign: "right",
  },
  cellSpace: { width: 80 },
  unit: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    textAlignVertical: "center",
    lineHeight: 44,
  },
  gridRow: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  colLabel: {
    ...face.semiBold,
    fontSize: 13,
    lineHeight: 18,
    textTransform: "uppercase",
    width: 80,
    textAlign: "right",
  },
  barLabel: { ...face.semiBold, fontSize: 13, lineHeight: 18, textTransform: "uppercase" },
  dock: { position: "absolute", left: space["3"], right: space["3"] },
  bar: { borderRadius: 22 },
  barInner: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    paddingHorizontal: space["4"],
    paddingVertical: space["2"],
  },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space["2"] },
  pill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 4 },
  step: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space["3"],
    borderRadius: 16,
    padding: space["4"],
    overflow: "hidden",
  },
  stepFill: { borderRadius: 16 },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { fontFamily: font.displayBold, fontSize: 16 },
  measure: { fontFamily: font.displayExtraBold, fontSize: 24, lineHeight: 30 },
});
