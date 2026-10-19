import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
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
import { Button, Field, HeaderButton, Notice, Screen, T } from "../../../../../../ui/components";
import { confirmDestructive } from "../../../../../../ui/confirm";
import { OUTCOME_LABELS } from "../../../../../../features/inspection/OutcomeChip";
import { confirmDeleteTest } from "../../../../../../features/inspection/remove";
import { haptics } from "../../../../../../ui/haptics";
import { Select } from "../../../../../../ui/Select";
import { useSheetLock } from "../../../../../../ui/sheet";
import { color, space } from "../../../../../../ui/theme";

/**
 * Add Test / Edit {Test name} (spec 6.1): the test type (adding only), the item, the type's
 * fields, the live calculation, the result, notes, photos, then Add Test or Save Test; editing
 * ends with Delete Test. Cancel asks first when anything changed.
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
  const existing =
    params.testId === "new" ? undefined : insp.tests.find((t) => t.id === params.testId);
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
  const [initial] = useState(snapshot);
  const dirty = snapshot() !== initial;
  useSheetLock(dirty);

  const calc = useMemo(
    () => (type ? calculate(type, normalizeTestData(type.field_schema, values)) : null),
    [type, values],
  );

  function cancel() {
    if (!dirty) return router.back();
    confirmDestructive({
      title: "Discard changes?",
      confirm: "Discard Changes",
      cancel: "Keep Editing",
      onConfirm: () => router.back(),
    });
  }

  const title = existing ? `Edit ${type?.name ?? "Test"}` : "Add Test";
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

  function save() {
    if (!type) return setErrors({ type: "Choose a test." });
    const e = validateTestData(type.field_schema, values as TestData);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
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
    if (existing) {
      services.sync.write("test_result", existing.id, company.id, record);
    } else {
      services.sync.insert("test_result", company.id, {
        ...record,
        job_id: jobId,
        test_type_id: type.id,
        performed_at: new Date().toISOString(),
      });
    }
    haptics.success();
    router.back();
  }

  const fields = type?.field_schema.fields ?? [];

  return (
    <Screen>
      {bar}
      <View style={styles.form}>
        {existing ? null : (
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
          return (
            <Field
              key={f.key}
              label={label}
              value={values[f.key] ?? ""}
              onChangeText={set}
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
        <MediaSection
          title="Photos"
          target={{ jobId, testResultId: existing?.id }}
          disabledReason={existing ? undefined : "Add the test first, then its photos."}
        />
        {Object.keys(errors).length > 0 ? (
          <Notice tone="error">Fix the highlighted fields.</Notice>
        ) : null}
        <Button title={existing ? "Save Test" : "Add Test"} wide onPress={save} />
        {existing && type ? (
          <View style={[styles.delete, { borderTopColor: color.separator }]}>
            <Button
              title="Delete Test"
              kind="danger"
              wide
              onPress={() =>
                confirmDeleteTest(services.sync, company.id, existing.id, type.name, () =>
                  router.back(),
                )
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
