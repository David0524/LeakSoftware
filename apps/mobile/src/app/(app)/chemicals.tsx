import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import {
  ACID_PRODUCTS,
  calculateChemistry,
  CHLORINE_PRODUCTS,
  type AcidProduct,
  type ChlorineProduct,
  type Readings,
  type Sanitizer,
  surfaceFor,
} from "@leakbook/core";
import {
  Block,
  Card,
  FieldGroup,
  FieldRow,
  Group,
  PickerRow,
  Row,
  Screen,
  Segmented,
  T,
} from "../../ui/components";
import { color, ios, radius, space } from "../../ui/theme";

// The pool chemical calculator (owner, 2026-10-16): the pool's size and today's readings in,
// what to add out, in order, shown first. Nothing is saved. The math is
// packages/core/src/chemistry.ts. A visit opens it with the pool's gallons and type.

const num = (v: string) => {
  const n = Number(v.replace(/,/g, ""));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

const READINGS: { key: keyof Readings; label: string; hint?: string }[] = [
  { key: "fc", label: "Free Chlorine", hint: "ppm" },
  { key: "ph", label: "pH" },
  { key: "ta", label: "Alkalinity", hint: "ppm" },
  { key: "ch", label: "Calcium", hint: "ppm" },
  { key: "cya", label: "Stabilizer", hint: "ppm" },
  { key: "salt", label: "Salt", hint: "ppm" },
  { key: "tempF", label: "Water Temp", hint: "°F" },
];

export default function Chemicals() {
  const params = useLocalSearchParams<{ gallons?: string; pool?: string }>();
  const [gallonsText, setGallonsText] = useState(
    Number(params.gallons) > 0 ? String(Math.round(Number(params.gallons))) : "",
  );
  // The surface only moves the calcium target; it comes from the pool (owner, 2026-10-16).
  const surface = surfaceFor(params.pool);
  const [sanitizer, setSanitizer] = useState<Sanitizer>("chlorine");
  const [values, setValues] = useState<Record<string, string>>({});
  const [chlorine, setChlorine] = useState<ChlorineProduct>("liquid12");
  const [acid, setAcid] = useState<AcidProduct>("muriatic31");

  // Pool size by gallons only (owner, 2026-10-16).
  const gallons = num(gallonsText) ?? 0;
  const readings: Readings = Object.fromEntries(
    READINGS.map((r) => [r.key, num(values[r.key] ?? "")]),
  );
  const result = calculateChemistry({ gallons, surface, sanitizer, readings, chlorine, acid });
  const ready = gallons > 0 && result.statuses.length > 0;

  return (
    <Screen>
      <Block title="What to Add" note={ready ? undefined : "Add the gallons and a reading below."}>
        {ready && result.steps.length === 0 ? (
          <Card>
            <T variant="strong" style={{ color: color.pass }}>
              Balanced. Nothing to add.
            </T>
          </Card>
        ) : null}
        {ready
          ? result.steps.map((s, i) => (
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
                    {s.amount ? <T variant="title">{s.amount}</T> : null}
                    <T variant="strong">{s.product}</T>
                    <T variant="muted">{s.why}</T>
                    {s.note ? <T variant="small">{s.note}</T> : null}
                  </View>
                </Row>
              </Card>
            ))
          : null}
        {ready && result.lsi !== null ? (
          <View style={{ paddingHorizontal: ios ? space["4"] : 0 }}>
            <T variant="small">
              Saturation index {result.lsi > 0 ? "+" : ""}
              {result.lsi.toFixed(1)} · {result.lsiLabel}
            </T>
          </View>
        ) : null}
      </Block>
      <FieldGroup title="Pool">
        <FieldRow
          label="Gallons"
          keyboardType="number-pad"
          value={gallonsText}
          onChangeText={setGallonsText}
          placeholder="20,000"
        />
      </FieldGroup>
      <Segmented
        label="Sanitizer"
        value={sanitizer}
        onChange={setSanitizer}
        options={[
          { value: "chlorine", label: "Chlorine" },
          { value: "salt", label: "Salt" },
        ]}
      />
      <FieldGroup title="Readings" labelWidth={128}>
        {READINGS.filter((r) => r.key !== "salt" || sanitizer === "salt").map((r) => (
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
    </Screen>
  );
}
