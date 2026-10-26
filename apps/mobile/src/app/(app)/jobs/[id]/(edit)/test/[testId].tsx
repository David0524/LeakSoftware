import { router, Stack, useLocalSearchParams } from "expo-router";
import { createRef, useMemo, useState, type RefObject } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import {
  calculate,
  normalizeTestData,
  previewTest,
  validateTestData,
  type Outcome,
  type TestData,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useInspectionConfig, useJobInspection } from "../../../../../../data/inspection";
import { useCompany, useSession } from "../../../../../../state/session";
import { MediaSection } from "../../../../../../features/media/MediaSection";
import { Button, Field, HeaderButton, Notice, Screen, T } from "../../../../../../ui/components";
import { OUTCOME_LABELS } from "../../../../../../features/inspection/OutcomeChip";
import { deleteTest } from "../../../../../../features/inspection/remove";
import { haptics } from "../../../../../../ui/haptics";
import { Select } from "../../../../../../ui/Select";
import { useDiscardChanges } from "../../../../../../ui/discard";
import { useSheetLock } from "../../../../../../ui/sheet";
import { color, space } from "../../../../../../ui/theme";

/**
 * Add Test / Edit {Test name} (spec 6.1): the test type (adding only), the item, the type's
 * fields, the live calculation, the result, notes, photos; editing ends with Delete Test. Add
 * Test or Save Test sits in a bar pinned at the bottom, above the keyboard (owner, 2026-10-20:
 * one-handed use, item 3), and Return (Next on iPhone's keyboard bar) moves through the
 * readings in order. Photos can be added before the test is saved: Add Photo saves it first.
 * Cancel, and Android's back button, ask first when anything changed.
 */
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
  // Add Photo on a new test saves it first; the sheet then edits that test.
  const [savedId, setSavedId] = useState<string | null>(null);
  const testId = params.testId === "new" ? savedId : params.testId;
  const existing = testId ? insp.tests.find((t) => t.id === testId) : undefined;
  const [typeId, setTypeId] = useState<string | null>(
    existing?.test_type_id ?? params.type ?? config.testTypes[0]?.id ?? null,
  );
  const type = config.testTypeById.get(existing?.test_type_id ?? typeId ?? "");

  const [componentId, setComponentId] = useState<string>(
    existing?.job_component_id ?? params.component ?? "",
  );
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const [k, v] of Object.entries(existing?.data ?? {})) init[k] = v == null ? "" : String(v);
    // A pressure test started from an item names the line after it.
    const comp = params.component ? insp.componentById.get(params.component) : undefined;
    if (!existing && comp) init.line_name = comp.label;
    return init;
  });
  // "" is "Use the calculation" (or "Not decided" when there is none).
  const [result, setResult] = useState<"" | Outcome>(existing?.outcome ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const snapshot = () => JSON.stringify({ typeId, componentId, values, result, notes });
  const [initial, setInitial] = useState(snapshot);
  const dirty = snapshot() !== initial;
  useSheetLock(dirty);
  // Every way out asks first while there are changes (owner, 2026-10-20).
  const leave = useDiscardChanges(dirty);
  // The readings' fields, in order, for Return / Next.
  const [refs] = useState(() => new Map<string, RefObject<TextInput | null>>());
  const refFor = (key: string) => {
    let ref = refs.get(key);
    if (!ref) refs.set(key, (ref = createRef<TextInput>()));
    return ref;
  };

  const calc = useMemo(() => (type ? previewTest(type, values) : null), [type, values]);

  function cancel() {
    router.back();
  }

  const title = existing || savedId ? `Edit ${type?.name ?? "Test"}` : "Add Test";
  const bar = (
    <Stack.Screen
      options={{
        title,
        headerBackVisible: false,
        headerLeft: () => <HeaderButton title="Cancel" onPress={cancel} />,
        headerRight: undefined,
      }}
    />
  );

  if ((params.testId !== "new" && !existing) || (existing && !type)) {
    return (
      <Screen>
        {bar}
        <Notice tone="warning">This test isn’t on this phone.</Notice>
      </Screen>
    );
  }
  if (!existing && config.testTypes.length === 0) {
    return (
      <Screen>
        {bar}
        <Notice tone="warning">
          No test types are set up. Add them in Settings on the website.
        </Notice>
      </Screen>
    );
  }

  /**
   * Save with the checks; `stay` keeps the sheet open (Add Photo on a new test). Returns the
   * test's id, or null when the checks failed (the errors show).
   */
  function save(stay = false): string | null {
    if (!type) {
      setErrors({ type: "Choose a test." });
      return null;
    }
    const e = validateTestData(type.field_schema, values as TestData);
    setErrors(e);
    if (Object.keys(e).length > 0) return null;
    const data = normalizeTestData(type.field_schema, values as TestData);
    const computed = calculate(type, data);
    const record: Record<string, JsonValue> = {
      job_component_id: componentId || null,
      schema_version: type.schema_version,
      data,
      computed: computed.computed,
      outcome: result || computed.suggested || null,
      notes: notes.trim() || null,
    };
    let id = existing?.id ?? savedId;
    if (id) {
      services.sync.write("test_result", id, company.id, record);
    } else {
      id = services.sync.insert("test_result", company.id, {
        ...record,
        job_id: jobId,
        test_type_id: type.id,
        performed_at: new Date().toISOString(),
      });
    }
    haptics.success();
    if (stay) {
      setSavedId(id);
      setInitial(snapshot());
    } else leave(() => router.back());
    return id;
  }

  const fields = type?.field_schema.fields ?? [];
  // Text and number readings, in order: Return moves to the next (owner, 2026-10-20).
  const typed = fields.filter((f) => f.type !== "select" && f.type !== "textarea");
  const nextOf = (key: string) => {
    const at = typed.findIndex((f) => f.key === key);
    return at >= 0 ? typed[at + 1] : undefined;
  };

  const saveLabel = existing || savedId ? "Save Test" : "Add Test";
  return (
    <Screen
      footer={<Button title={saveLabel} wide onPress={() => save()} />}
      // iPhone: Previous, Next and Done over the keyboard.
      keyboardBar
    >
      {bar}
      <View style={styles.form}>
        {existing || savedId ? null : (
          <Select
            label="Test"
            options={config.testTypes.map((t) => ({ value: t.id, label: t.name }))}
            value={typeId}
            onChange={(v) => {
              setTypeId(v);
              setValues({});
              setResult("");
            }}
            error={errors.type}
          />
        )}
        <Select
          label="Item (optional)"
          options={[
            { value: "", label: "Whole job" },
            ...insp.components.map((c) => ({ value: c.id, label: c.label })),
          ]}
          value={componentId}
          onChange={setComponentId}
        />
        {fields.map((f) => {
          const label = f.unit ? `${f.label} (${f.unit})` : f.label;
          const set = (v: string) => setValues((s) => ({ ...s, [f.key]: v }));
          if (f.type === "select")
            return (
              <Select
                key={f.key}
                label={label}
                options={[
                  { value: "", label: "Choose…" },
                  ...(f.options ?? []).map((o) => ({ value: o, label: o })),
                ]}
                value={values[f.key] ?? ""}
                onChange={set}
                error={errors[f.key]}
              />
            );
          const next = f.type === "textarea" ? undefined : nextOf(f.key);
          return (
            <Field
              key={f.key}
              ref={refFor(f.key)}
              label={label}
              value={values[f.key] ?? ""}
              onChangeText={set}
              {...(f.type === "textarea"
                ? null
                : {
                    returnKeyType: next ? ("next" as const) : ("done" as const),
                    submitBehavior: next ? ("submit" as const) : ("blurAndSubmit" as const),
                    onSubmitEditing: () => (next ? refFor(next.key).current?.focus() : undefined),
                  })}
              multiline={f.type === "textarea"}
              keyboardType={f.type === "number" ? "decimal-pad" : "default"}
              autoCapitalize={f.type === "number" ? "none" : "sentences"}
              error={errors[f.key]}
            />
          );
        })}
        {calc?.summary ? (
          <View accessibilityLiveRegion="polite">
            <T variant="bodyEmphasis">{calc.summary}</T>
          </View>
        ) : null}
        <Select
          label="Result"
          options={[
            {
              value: "" as const,
              label: calc?.suggested
                ? `Use the calculation (${OUTCOME_LABELS[calc.suggested]})`
                : "Not decided",
            },
            ...(type?.result_options ?? (["pass", "fail", "inconclusive"] as Outcome[])).map(
              (o) => ({ value: o, label: OUTCOME_LABELS[o] }),
            ),
          ]}
          value={result}
          onChange={setResult}
        />
        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
        {/* Shown from the start: Add Photo saves a new test first (owner, 2026-10-20). */}
        <MediaSection
          title="Photos"
          target={{ jobId, testResultId: testId ?? undefined }}
          unsaved={!testId}
          beforeCapture={() => {
            const id = existing ? existing.id : save(true);
            return id ? { jobId, testResultId: id } : null;
          }}
        />
        {Object.keys(errors).length > 0 ? (
          <Notice tone="error">Fix the highlighted fields.</Notice>
        ) : null}
        {existing && type ? (
          <View style={[styles.delete, { borderTopColor: color.separator }]}>
            <Button
              title="Delete Test"
              kind="danger"
              wide
              onPress={() =>
                deleteTest(services.sync, company.id, existing.id, () => leave(() => router.back()))
              }
            />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: space["4"] },
  delete: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space["4"],
    marginTop: space["2"],
  },
});
