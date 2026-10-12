import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, View } from "react-native";
import {
  calculate,
  normalizeTestData,
  validateTestData,
  type Outcome,
  type TestData,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useInspectionConfig, useJobInspection } from "../../../../../data/inspection";
import { useCompany, useSession } from "../../../../../state/session";
import { Button, Card, Choice, Field, Notice, Screen, T } from "../../../../../ui/components";
import { OUTCOME_STYLE } from "../../../../../features/inspection/OutcomeChip";
import { color } from "../../../../../ui/theme";

/** Record or edit one test. The form comes from the test type's field schema. */
export default function TestScreen() {
  const params = useLocalSearchParams<{
    id: string;
    testId: string;
    type?: string;
    component?: string;
  }>();
  const jobId = params.id;
  const company = useCompany();
  const { services } = useSession();
  const config = useInspectionConfig(company.id);
  const insp = useJobInspection(company.id, jobId);
  const existing =
    params.testId === "new" ? undefined : insp.tests.find((t) => t.id === params.testId);
  const type = config.testTypeById.get(existing?.test_type_id ?? params.type ?? "");

  const [componentId, setComponentId] = useState<string | null>(
    existing?.job_component_id ?? params.component ?? null,
  );
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const [k, v] of Object.entries(existing?.data ?? {})) init[k] = v == null ? "" : String(v);
    // A pressure test started from a component names the line after it.
    const comp = params.component ? insp.componentById.get(params.component) : undefined;
    if (!existing && comp) init.line_name = comp.label;
    return init;
  });
  const [chosenOutcome, setChosenOutcome] = useState<Outcome | null>(existing?.outcome ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const calc = useMemo(() => (type ? calculate(type, values as TestData) : null), [type, values]);

  if (!type || (params.testId !== "new" && !existing)) {
    return (
      <Screen>
        <Notice tone="warning">This test isn’t on this phone.</Notice>
      </Screen>
    );
  }
  const testType = type;
  const outcome = chosenOutcome ?? calc?.suggested ?? null;

  function save() {
    const e = validateTestData(testType.field_schema, values as TestData);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const data = normalizeTestData(testType.field_schema, values as TestData);
    const record: Record<string, JsonValue> = {
      job_component_id: componentId,
      schema_version: testType.schema_version,
      data,
      computed: calculate(testType, data).computed,
      outcome,
      notes: notes.trim() || null,
    };
    if (existing) {
      services.sync.write("test_result", existing.id, company.id, record);
    } else {
      services.sync.insert("test_result", company.id, {
        ...record,
        job_id: jobId,
        test_type_id: testType.id,
        performed_at: new Date().toISOString(),
      });
    }
    router.back();
  }

  function remove() {
    Alert.alert("Delete this test?", undefined, [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          services.sync.write("test_result", existing!.id, company.id, {
            deleted_at: new Date().toISOString(),
          });
          router.back();
        },
      },
    ]);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: testType.name }} />
      <Choice
        label="Component"
        options={[
          { value: "", label: "None" },
          ...insp.components.map((c) => ({ value: c.id, label: c.label })),
        ]}
        value={componentId ?? ""}
        onChange={(v) => setComponentId(v || null)}
      />

      {testType.field_schema.fields.map((f) =>
        f.type === "select" ? (
          <View key={f.key}>
            <Choice
              label={f.label}
              options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
              value={values[f.key] || null}
              onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
            />
            {errors[f.key] ? (
              <T variant="small" style={{ color: color.fail }}>
                {errors[f.key]}
              </T>
            ) : null}
          </View>
        ) : (
          <Field
            key={f.key}
            label={f.unit ? `${f.label} (${f.unit})` : f.label}
            value={values[f.key] ?? ""}
            onChangeText={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
            keyboardType={f.type === "number" ? "decimal-pad" : "default"}
            multiline={f.type === "textarea"}
            error={errors[f.key]}
          />
        ),
      )}

      {calc?.summary ? (
        <Card>
          <T variant="label">Result</T>
          <T variant="heading">{calc.summary}</T>
          {calc.suggested ? (
            <T variant="muted">Suggested: {OUTCOME_STYLE[calc.suggested].label.toLowerCase()}</T>
          ) : null}
        </Card>
      ) : null}

      <Choice
        label="Outcome"
        options={testType.result_options.map((o) => ({
          value: o,
          label: OUTCOME_STYLE[o].label[0] + OUTCOME_STYLE[o].label.slice(1).toLowerCase(),
        }))}
        value={outcome}
        onChange={setChosenOutcome}
      />
      {chosenOutcome && calc?.suggested && chosenOutcome !== calc.suggested ? (
        <Notice tone="warning">You changed the suggested outcome. Add a note saying why.</Notice>
      ) : null}
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
      {Object.keys(errors).length > 0 ? (
        <Notice tone="error">Fix the highlighted fields.</Notice>
      ) : null}
      <Button title="Save test" onPress={save} />
      {existing ? <Button title="Delete test" kind="danger" onPress={remove} /> : null}
    </Screen>
  );
}
