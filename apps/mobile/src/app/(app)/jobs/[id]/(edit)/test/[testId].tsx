import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import {
  calculate,
  normalizeTestData,
  validateTestData,
  type Outcome,
  type TestData,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useInspectionConfig, useJobInspection } from "../../../../../../data/inspection";
import { useCompany, useSession } from "../../../../../../state/session";
import { MediaSection } from "../../../../../../features/media/MediaSection";
import {
  Button,
  Card,
  Choice,
  Field,
  HeaderButton,
  Notice,
  Screen,
  T,
  Segmented,
} from "../../../../../../ui/components";
import { confirmDestructive } from "../../../../../../ui/confirm";
import { OUTCOME_STYLE } from "../../../../../../features/inspection/OutcomeChip";
import { confirmDeleteTest } from "../../../../../../features/inspection/remove";
import { haptics } from "../../../../../../ui/haptics";
import { useSheetLock } from "../../../../../../ui/sheet";
import { color, ios } from "../../../../../../ui/theme";

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

  // Anything changed since the sheet opened? Then Cancel asks first, and on iPhone a swipe down
  // doesn't close the sheet by accident (as in New Job).
  const [initial] = useState(() => JSON.stringify({ componentId, values, chosenOutcome, notes }));
  const dirty = JSON.stringify({ componentId, values, chosenOutcome, notes }) !== initial;
  useSheetLock(dirty);

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

  function cancel() {
    if (!dirty) return router.back();
    confirmDestructive({
      title: existing ? "Discard your changes?" : "Discard this test?",
      confirm: "Discard",
      cancel: "Keep Editing",
      onConfirm: () => router.back(),
    });
  }

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
    haptics.success();
    router.back();
  }

  function remove() {
    confirmDeleteTest(services.sync, company.id, existing!.id, () => router.back());
  }

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: testType.name,
          // iPhone sheet: Cancel and Save in the bar. Android keeps its back arrow.
          ...(ios
            ? {
                headerLeft: () => <HeaderButton title="Cancel" onPress={cancel} />,
                headerRight: () => <HeaderButton title="Save" strong onPress={save} />,
              }
            : null),
        }}
      />
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

      <Segmented
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
      <MediaSection
        target={{ jobId, testResultId: existing?.id }}
        disabledReason={existing ? undefined : "Save the test first, then add photos."}
      />
      {Object.keys(errors).length > 0 ? (
        <Notice tone="error">Fix the highlighted fields.</Notice>
      ) : null}
      <Button title="Save Test" onPress={save} />
      {existing ? <Button title="Delete Test" kind="danger" onPress={remove} /> : null}
    </Screen>
  );
}
