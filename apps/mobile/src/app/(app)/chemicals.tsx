import { useState } from "react";
import { View } from "react-native";
import {
  ACID_PRODUCTS,
  calculateChemistry,
  CHLORINE_PRODUCTS,
  poolGallons,
  type AcidProduct,
  type ChlorineProduct,
  type PoolShapeForVolume,
  type Readings,
  type Sanitizer,
  type Surface,
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
// what to add out, in order. Nothing is saved. The math is packages/core/src/chemistry.ts.

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
  const [sizeBy, setSizeBy] = useState<"measure" | "gallons">("measure");
  const [gallonsText, setGallonsText] = useState("");
  const [shape, setShape] = useState<PoolShapeForVolume>("rectangle");
  const [dims, setDims] = useState({ length: "", width: "", shallow: "", deep: "" });
  const [surface, setSurface] = useState<Surface>("plaster");
  const [sanitizer, setSanitizer] = useState<Sanitizer>("chlorine");
  const [values, setValues] = useState<Record<string, string>>({});
  const [chlorine, setChlorine] = useState<ChlorineProduct>("liquid12");
  const [acid, setAcid] = useState<AcidProduct>("muriatic31");

  const measured = poolGallons(
    shape,
    num(dims.length) ?? 0,
    shape === "round" ? 0 : (num(dims.width) ?? 0),
    num(dims.shallow) ?? 0,
    num(dims.deep) ?? num(dims.shallow) ?? 0,
  );
  const gallons = sizeBy === "gallons" ? (num(gallonsText) ?? 0) : measured;
  const readings: Readings = Object.fromEntries(
    READINGS.map((r) => [r.key, num(values[r.key] ?? "")]),
  );
  const result = calculateChemistry({ gallons, surface, sanitizer, readings, chlorine, acid });
  const ready = gallons > 0 && result.statuses.length > 0;

  return (
    <Screen>
      <Segmented
        label="Pool Size"
        value={sizeBy}
        onChange={setSizeBy}
        options={[
          { value: "measure", label: "Measure" },
          { value: "gallons", label: "Gallons" },
        ]}
      />
      {sizeBy === "gallons" ? (
        <FieldGroup>
          <FieldRow
            label="Gallons"
            keyboardType="number-pad"
            value={gallonsText}
            onChangeText={setGallonsText}
            placeholder="20,000"
          />
        </FieldGroup>
      ) : (
        <>
          <Segmented
            value={shape}
            onChange={setShape}
            options={[
              { value: "rectangle", label: "Rectangle" },
              { value: "kidney", label: "Kidney" },
              { value: "oval", label: "Oval" },
              { value: "round", label: "Round" },
            ]}
          />
          <FieldGroup
            footer={gallons > 0 ? `About ${gallons.toLocaleString("en-US")} gallons` : undefined}
          >
            <FieldRow
              label={shape === "round" ? "Across (ft)" : "Length (ft)"}
              keyboardType="decimal-pad"
              value={dims.length}
              onChangeText={(v) => setDims({ ...dims, length: v })}
            />
            {shape === "round" ? null : (
              <FieldRow
                label="Width (ft)"
                keyboardType="decimal-pad"
                value={dims.width}
                onChangeText={(v) => setDims({ ...dims, width: v })}
              />
            )}
            <FieldRow
              label="Shallow (ft)"
              keyboardType="decimal-pad"
              value={dims.shallow}
              onChangeText={(v) => setDims({ ...dims, shallow: v })}
            />
            <FieldRow
              label="Deep (ft)"
              keyboardType="decimal-pad"
              value={dims.deep}
              onChangeText={(v) => setDims({ ...dims, deep: v })}
            />
          </FieldGroup>
        </>
      )}
      <Segmented
        label="Surface"
        value={surface}
        onChange={setSurface}
        options={[
          { value: "plaster", label: "Plaster" },
          { value: "vinyl", label: "Vinyl" },
          { value: "fiberglass", label: "Fiberglass" },
        ]}
      />
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

      <Block
        title="What to Add"
        note={
          ready
            ? "Starting points from standard dosing charts. Add in portions with the pump running, follow the label, and retest."
            : "Enter the pool’s size and at least one reading."
        }
      >
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
    </Screen>
  );
}
