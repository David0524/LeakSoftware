import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ACID_PRODUCTS,
  calculateChemistry,
  doseSummary,
  CHLORINE_PRODUCTS,
  type AcidProduct,
  type ChemistryResult,
  type ChlorineProduct,
  type ReadingKey,
  type Readings,
  targets,
} from "@leakbook/core";
import { getServices } from "../../lib/services";
import {
  Card,
  FieldGroup,
  FieldRow,
  Group,
  HeaderButton,
  PickerRow,
  Row,
  Screen,
  T,
} from "../../ui/components";
import { color, radius, space } from "../../ui/theme";
import { ScreenTip } from "../../ui/Tip";

// The pool chemical calculator (owner, 2026-10-16): the pool's size and today's readings in,
// what to add out, in order. Readings fill the screen; What to Add is a bar docked at the
// bottom that opens a sheet ("a pop up card from the bottom"). Nothing is saved. The math is
// packages/core/src/chemistry.ts. A visit opens it with the pool's gallons. Every pool gets the
// same readings and targets; salt is left blank on a chlorine pool (owner, 2026-10-18).

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

const READINGS: { key: keyof Readings; label: string; hint?: string }[] = [
  { key: "fc", label: "Free Chlorine", hint: "ppm" },
  { key: "ph", label: "pH" },
  { key: "ta", label: "Alkalinity", hint: "ppm" },
  { key: "ch", label: "Calcium", hint: "ppm" },
  { key: "cya", label: "Stabilizer", hint: "ppm" },
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

export default function Chemicals() {
  const params = useLocalSearchParams<{ gallons?: string }>();
  const [gallonsText, setGallonsText] = useState(
    Number(params.gallons) > 0 ? withCommas(String(Math.round(Number(params.gallons)))) : "",
  );
  const [sheet, setSheet] = useState(false);
  const insets = useSafeAreaInsets();
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

  // Pool size by gallons only (owner, 2026-10-16).
  const gallons = num(gallonsText) ?? 0;
  const readings: Readings = Object.fromEntries(
    READINGS.map((r) => [r.key, num(values[r.key] ?? "")]),
  );
  const recommended = targets(readings.cya);
  const result = calculateChemistry({
    gallons,
    readings,
    chlorine,
    acid,
    goals: Object.fromEntries(Object.entries(goals).map(([k, v]) => [k, num(v)])),
  });
  const ready = gallons > 0 && result.statuses.length > 0;

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <ScreenTip screen="chemicals" />
        <FieldGroup title="Pool">
          <FieldRow
            label="Gallons"
            keyboardType="number-pad"
            value={gallonsText}
            onChangeText={(v) => setGallonsText(withCommas(v))}
            placeholder="20,000"
          />
        </FieldGroup>
        <FieldGroup title="Readings" labelWidth={128}>
          {READINGS.map((r) => (
            <FieldRow
              key={r.key}
              label={r.label}
              hint={r.hint}
              keyboardType="decimal-pad"
              value={values[r.key] ?? ""}
              onChangeText={(v) => setValues({ ...values, [r.key]: v })}
            />
          ))}
        </FieldGroup>
        <FieldGroup
          title="Aim For"
          footer="Blank uses the recommended level. Type your own, like 6 for chlorine, to dose to it."
          labelWidth={128}
        >
          {READINGS.map((r) => (
            <FieldRow
              key={r.key}
              label={r.label}
              hint={r.hint}
              keyboardType="decimal-pad"
              placeholder={String(recommended[r.key as ReadingKey].target)}
              value={goals[r.key] ?? ""}
              onChangeText={(v) => setGoals({ ...goals, [r.key]: v })}
            />
          ))}
        </FieldGroup>
        <Group>
          <PickerRow
            label="Chlorine"
            value={chlorine}
            onChange={setChlorine}
            options={Object.entries(CHLORINE_PRODUCTS).map(([value, label]) => ({
              value: value as ChlorineProduct,
              label,
            }))}
          />
          <PickerRow
            label="Acid"
            value={acid}
            onChange={setAcid}
            options={Object.entries(ACID_PRODUCTS).map(([value, label]) => ({
              value: value as AcidProduct,
              label,
            }))}
          />
        </Group>
        {/* Room to scroll the last rows clear of the docked bar. */}
        <View style={{ height: 72 }} />
      </Screen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`What to Add: ${doseSummary(result, ready)}`}
        accessibilityState={{ disabled: !ready }}
        disabled={!ready}
        onPress={() => setSheet(true)}
        style={({ pressed }) => [
          styles.bar,
          { bottom: insets.bottom + space["3"] },
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={{ flex: 1 }}>
          <T variant="label">What to Add</T>
          <T variant={ready ? "strong" : "muted"} numberOfLines={1}>
            {doseSummary(result, ready)}
          </T>
        </View>
        {ready ? (
          <T variant="strong" style={{ color: color.link }}>
            Show
          </T>
        ) : null}
      </Pressable>
      <Modal
        visible={sheet}
        animationType="slide"
        // iPhone: a page sheet that swipes down to close.
        presentationStyle="pageSheet"
        onRequestClose={() => setSheet(false)}
      >
        <View style={styles.sheet}>
          <Row style={styles.sheetBar}>
            <View style={{ width: 64 }} />
            <T variant="strong" style={{ flex: 1, textAlign: "center" }}>
              What to Add
            </T>
            <View style={{ width: 64, alignItems: "flex-end" }}>
              <HeaderButton title="Done" strong onPress={() => setSheet(false)} />
            </View>
          </Row>
          <ScrollView contentContainerStyle={{ padding: space["4"], gap: space["3"] }}>
            <Doses result={result} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

/** The steps in order, the everyday measure first and the exact amount under it. */
function Doses({ result }: { result: ChemistryResult }) {
  return (
    <>
      {result.steps.length === 0 ? (
        <Card>
          <T variant="strong" style={{ color: color.pass }}>
            Balanced. Nothing to add.
          </T>
        </Card>
      ) : null}
      {result.steps.map((s, i) => (
        <Card key={s.key + s.product}>
          <Row style={{ alignItems: "flex-start", gap: space["3"] }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: radius.pill,
                backgroundColor: color.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <T variant="strong" style={{ color: color.onPrimary }}>
                {String(i + 1)}
              </T>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              {s.measure ? <T variant="title">{s.measure}</T> : null}
              <T variant="strong">{s.product}</T>
              {s.amount ? <T variant="muted">About {s.amount}</T> : null}
              <T variant="muted">{s.why}</T>
              {s.note ? <T variant="small">{s.note}</T> : null}
            </View>
          </Row>
        </Card>
      ))}
      {result.lsi !== null ? (
        <View style={{ paddingHorizontal: space["1"] }}>
          <T variant="small">
            Saturation index {result.lsi > 0 ? "+" : ""}
            {result.lsi.toFixed(1)} · {result.lsiLabel}
          </T>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: space["3"],
    right: space["3"],
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    paddingHorizontal: space["4"],
    paddingVertical: space["2"],
    borderRadius: 22,
    backgroundColor: color.surface,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  sheet: { flex: 1, backgroundColor: color.bg },
  sheetBar: { paddingHorizontal: space["4"], paddingVertical: space["3"] },
});
