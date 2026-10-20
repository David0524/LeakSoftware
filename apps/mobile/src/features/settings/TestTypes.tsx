import { useState } from "react";
import { formatFieldLines, parseFieldLines, type Outcome, type TestType } from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { confirmDestructive } from "../../ui/confirm";
import { removeConfig, saveConfig, toInt, useConfig } from "../../data/config";
import { useCompany } from "../../state/session";
import {
  FieldGroup,
  FieldRow,
  Group,
  ListRow,
  Notice,
  Section,
  T,
  Toggle,
} from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { EditSheet, FormActions, ManagersOnly, SettingsList, useEditSheet } from "./SettingsList";
import { formChanged } from "../../lib/discard";
import { useUnsavedChanges } from "../../ui/ModalSheet";

// Settings › Test Types (the website's settings/tests): the built-in calculators' pass and
// fail lines, and the fields of the shop's own tests, one per line.

const OPTION_LABELS: Record<string, { label: string; hint: string }> = {
  pass_max_drop_psi: {
    label: "Largest drop that still passes (PSI)",
    hint: "0 means the line must hold steady.",
  },
  min_duration_min: {
    label: "Shortest test that counts (minutes)",
    hint: "Shorter tests are marked unclear.",
  },
  fail_over_in_per_day: {
    label: "Fail above this loss per day (inches)",
    hint: "Water lost beyond evaporation, per 24 hours.",
  },
};

const FIELD_HELP =
  "One field per line. Add “(unit)” for a measurement, “: notes” for long text, or choices separated by “/”. End with * if required.";

export function TestTypes() {
  return (
    <ManagersOnly title="Test Types">
      <TestTypesPage />
    </ManagersOnly>
  );
}

function TestTypesPage() {
  const company = useCompany();
  const types = useConfig<TestType>("test_type", company.id);
  const sheet = useEditSheet<TestType>();
  return (
    <>
      <SettingsList
        title="Test Types"
        subtitle="Tests techs record on the phone. Pressure and bucket tests do the math; set the pass and fail lines your shop uses."
        addLabel="Add Test Type"
        onAdd={() => sheet.open("new")}
        notice={sheet.notice}
      >
        <Group>
          {types.map((t) => (
            <ListRow
              key={t.id}
              title={t.name}
              subtitle={t.calculator ? "Calculates the result" : undefined}
              detail={t.active ? undefined : "Off"}
              onPress={() => sheet.open(t)}
              // Swipe to remove; the row's sheet keeps its visible Remove button.
              deleteLabel="Remove Test Type"
              onDelete={() =>
                confirmDestructive({
                  title: "Remove this test type?",
                  confirm: "Remove Test Type",
                  onConfirm: () => removeConfig("test_type", company.id, t.id),
                })
              }
            />
          ))}
        </Group>
      </SettingsList>
      <EditSheet
        open={sheet.editing != null}
        title={sheet.editing === "new" ? "Add Test Type" : (sheet.editing?.name ?? "")}
        onClose={sheet.close}
      >
        <TestForm
          t={sheet.editing === "new" ? undefined : (sheet.editing ?? undefined)}
          onDone={sheet.done}
        />
      </EditSheet>
    </>
  );
}

function TestForm({ t, onDone }: { t?: TestType; onDone: (m: string) => void }) {
  const company = useCompany();
  const [name, setName] = useState(t?.name ?? "");
  const [order, setOrder] = useState(String(t ? t.sort_order : 100));
  const [lines, setLines] = useState(
    t && !t.calculator ? formatFieldLines(t.field_schema.fields) : "",
  );
  const [options, setOptions] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(t?.field_schema.options ?? {}).map(([k, v]) => [k, String(v)]),
    ),
  );
  const [outcomes, setOutcomes] = useState<Set<Outcome>>(
    () => new Set(t?.result_options ?? ["pass", "fail", "inconclusive"]),
  );
  const [active, setActive] = useState(t?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Unsaved entries ask before closing (owner, 2026-10-20: "Discard changes?" everywhere).
  const entries = { name, order, lines, options, outcomes: [...outcomes].sort(), active };
  const [startEntries] = useState(entries);
  useUnsavedChanges(formChanged(startEntries, entries));
  function toggle(o: Outcome, on: boolean) {
    const next = new Set(outcomes);
    if (on) next.add(o);
    else next.delete(o);
    setOutcomes(next);
  }

  function save() {
    const e: Record<string, string> = {};
    setError(null);
    if (!name.trim()) e.name = "Enter a name.";
    const chosen = (["pass", "fail", "inconclusive"] as Outcome[]).filter((o) => outcomes.has(o));
    const values: Record<string, JsonValue> = {
      name: name.trim(),
      result_options: chosen,
      sort_order: toInt(order),
      active: t ? active : true,
    };
    if (t?.calculator) {
      const next: Record<string, number> = { ...(t.field_schema.options ?? {}) };
      for (const key of Object.keys(next)) {
        const raw = options[key] ?? "";
        const n = Number(raw);
        if (raw.trim() === "" || !Number.isFinite(n) || n < 0)
          e[`option_${key}`] = "Enter a number, 0 or more.";
        else next[key] = n;
      }
      values.field_schema = { ...t.field_schema, options: next } as unknown as JsonValue;
    } else {
      const parsed = parseFieldLines(lines);
      if (parsed.errors.length) e.fields = parsed.errors.join(" ");
      values.field_schema = { fields: parsed.fields } as unknown as JsonValue;
      const changed = JSON.stringify(t?.field_schema.fields) !== JSON.stringify(parsed.fields);
      // Results keep the schema version they were recorded with.
      if (t && changed) values.schema_version = t.schema_version + 1;
      if (!t) values.schema_version = 1;
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    if (chosen.length < 2) {
      setError("Offer at least two outcomes.");
      return;
    }
    saveConfig("test_type", company.id, t?.id ?? null, values, t ? undefined : name.trim());
    haptics.success();
    onDone(t ? "Saved." : `Added ${name.trim()}.`);
  }

  return (
    <>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <FieldGroup labelWidth={80}>
        <FieldRow
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder={t ? undefined : "Thermal camera scan"}
          error={errors.name}
        />
        <FieldRow label="Order" value={order} onChangeText={setOrder} keyboardType="number-pad" />
      </FieldGroup>
      {t?.calculator ? (
        <>
          <FieldGroup>
            {Object.keys(t.field_schema.options ?? {}).map((key) => (
              <FieldRow
                key={key}
                label={OPTION_LABELS[key]?.label ?? key}
                hint={errors[`option_${key}`] ? undefined : OPTION_LABELS[key]?.hint}
                error={errors[`option_${key}`]}
                layout="stacked"
                keyboardType="decimal-pad"
                value={options[key] ?? ""}
                onChangeText={(v) => setOptions({ ...options, [key]: v })}
              />
            ))}
          </FieldGroup>
          <T variant="secondary" muted>
            Fields: {t.field_schema.fields.map((f) => f.label).join(", ")}. Built-in; the phone
            calculates the result from these.
          </T>
        </>
      ) : (
        <FieldGroup footer={FIELD_HELP}>
          <FieldRow
            label="Fields"
            layout="stacked"
            multiline
            value={lines}
            onChangeText={setLines}
            placeholder={
              "Location *\nSurface temp (°F)\nResult: Leak / No leak / Unclear\nNotes: notes"
            }
            error={errors.fields}
          />
        </FieldGroup>
      )}
      <Section title="Outcomes offered">
        <Group>
          <Toggle
            inList
            label="Pass"
            value={outcomes.has("pass")}
            onChange={(v) => toggle("pass", v)}
          />
          <Toggle
            inList
            label="Fail"
            value={outcomes.has("fail")}
            onChange={(v) => toggle("fail", v)}
          />
          <Toggle
            inList
            label="Unclear"
            value={outcomes.has("inconclusive")}
            onChange={(v) => toggle("inconclusive", v)}
          />
        </Group>
      </Section>
      {t ? (
        <Group>
          <Toggle inList label="Techs can record this test" value={active} onChange={setActive} />
        </Group>
      ) : null}
      <FormActions
        submit={t ? "Save" : "Add Test Type"}
        onSubmit={save}
        remove={
          t && !t.calculator
            ? {
                label: "Remove Test Type",
                confirm: "Remove this test type?",
                onConfirm: () => {
                  removeConfig("test_type", company.id, t.id);
                  onDone("Removed.");
                },
              }
            : undefined
        }
      />
    </>
  );
}
