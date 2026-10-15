import { router, Stack, useLocalSearchParams } from "expo-router";
import { createRef, useMemo, useState, type RefObject } from "react";
import type { TextInput } from "react-native";
import {
  calculate,
  normalizeTestData,
  validateTestData,
  type Outcome,
  type TestData,
  type TestType,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useInspectionConfig, useJobInspection } from "../../../../../../data/inspection";
import { useCompany, useSession } from "../../../../../../state/session";
import { MediaSection } from "../../../../../../features/media/MediaSection";
import {
  Button,
  Card,
  FieldGroup,
  FieldRow,
  HeaderButton,
  Notice,
  PickerRow,
  Screen,
  T,
  Segmented,
} from "../../../../../../ui/components";
import { confirmDestructive } from "../../../../../../ui/confirm";
import { OUTCOME_STYLE } from "../../../../../../features/inspection/OutcomeChip";
import { confirmDeleteTest } from "../../../../../../features/inspection/remove";
import { haptics } from "../../../../../../ui/haptics";
import { useSheetLock } from "../../../../../../ui/sheet";
import { ios } from "../../../../../../ui/theme";

type SchemaField = TestType["field_schema"]["fields"][number];

/**
 * The form's fields in runs: a long-text field gets its own block (on iPhone, under its label
 * as a header); the fields between share one.
 */
function runs(fields: SchemaField[]): SchemaField[][] {
  const out: SchemaField[][] = [];
  for (const f of fields) {
    const last = out[out.length - 1];
    if (f.type === "textarea" || !last || last[0]!.type === "textarea") out.push([f]);
    else last.push(f);
  }
  return out;
}

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

  // Return moves from one typed field to the next, as in iOS forms.
  const [inputs] = useState(() => new Map<string, RefObject<TextInput | null>>());
  const inputRef = (key: string) => {
    let r = inputs.get(key);
    if (!r) inputs.set(key, (r = createRef<TextInput>()));
    return r;
  };

  if (!type || (params.testId !== "new" && !existing)) {
    return (
      <Screen>
        <Notice tone="warning">This test isn’t on this phone.</Notice>
      </Screen>
    );
  }
  const testType = type;
  const outcome = chosenOutcome ?? calc?.suggested ?? null;

  // Typed fields, in order, for moving on with Return.
  const typed = testType.field_schema.fields.filter((f) => f.type !== "select");
  const nextOf = (key: string) => {
    const i = typed.findIndex((f) => f.key === key);
    const n = typed[i + 1];
    return n ? inputRef(n.key) : undefined;
  };
  const component = (
    <PickerRow
      key="component"
      label="Component"
      options={[
        { value: "", label: "None" },
        ...insp.components.map((c) => ({ value: c.id, label: c.label })),
      ]}
      value={componentId ?? ""}
      onChange={(v) => setComponentId(v || null)}
    />
  );
  const groups = runs(testType.field_schema.fields);
  const startsAlone = groups[0]?.[0]?.type === "textarea";

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
      {startsAlone || groups.length === 0 ? <FieldGroup>{component}</FieldGroup> : null}
      {groups.map((run, gi) =>
        run[0]!.type === "textarea" ? (
          <FieldGroup key={run[0]!.key} title={run[0]!.label}>
            <FieldRow
              ref={inputRef(run[0]!.key)}
              label={run[0]!.label}
              value={values[run[0]!.key] ?? ""}
              onChangeText={(v) => setValues((s) => ({ ...s, [run[0]!.key]: v }))}
              multiline
              error={errors[run[0]!.key]}
            />
          </FieldGroup>
        ) : (
          <FieldGroup key={run[0]!.key} labelWidth={150}>
            {gi === 0 ? component : null}
            {run.map((f) =>
              f.type === "select" ? (
                <PickerRow
                  key={f.key}
                  label={f.label}
                  options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
                  value={values[f.key] || null}
                  onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                  error={errors[f.key]}
                />
              ) : (
                <FieldRow
                  key={f.key}
                  ref={inputRef(f.key)}
                  next={nextOf(f.key)}
                  label={f.unit ? `${f.label} (${f.unit})` : f.label}
                  value={values[f.key] ?? ""}
                  onChangeText={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                  keyboardType={f.type === "number" ? "decimal-pad" : "default"}
                  autoCapitalize={f.type === "number" ? "none" : "sentences"}
                  error={errors[f.key]}
                />
              ),
            )}
          </FieldGroup>
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
        grouped
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
      <FieldGroup>
        <FieldRow label="Notes" value={notes} onChangeText={setNotes} multiline />
      </FieldGroup>
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
