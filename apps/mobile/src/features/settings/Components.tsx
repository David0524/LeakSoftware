import { useState } from "react";
import {
  CHECKLIST_SECTION_LABELS,
  companyServices,
  type ChecklistSection,
  type ComponentType,
} from "@leakbook/core";
import { removeConfig, saveConfig, toInt, useConfig } from "../../data/config";
import { useCompany } from "../../state/session";
import {
  Button,
  FieldGroup,
  FieldRow,
  Group,
  ListRow,
  Section,
  Segmented,
  Toggle,
} from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { Select } from "../../ui/Select";
import { EditSheet, FormActions, ManagersOnly, SettingsList, useEditSheet } from "./SettingsList";

// Settings › Checklist Components (the website's settings/components): pool visits and leak
// inspections have their own checklists; a shop that does both switches between them.

const APPLIES = [
  { value: "pool", label: "Pool" },
  { value: "spa", label: "Spa" },
  { value: "both", label: "Pool and spa" },
];
type Kind = "pool" | "leak";
const LEAK_SECTIONS: ChecklistSection[] = ["visual", "plumbing", "bond_beam", "other"];

export function ChecklistComponents() {
  return (
    <ManagersOnly title="Checklist Components">
      <ComponentsPage />
    </ManagersOnly>
  );
}

function ComponentsPage() {
  const company = useCompany();
  const types = useConfig<ComponentType>("component_type", company.id);
  const sheet = useEditSheet<ComponentType>();
  const services = companyServices(company.settings);
  const kinds: Kind[] = services === "both" ? ["pool", "leak"] : [services];
  const [chosen, setChosen] = useState<Kind>(kinds[0]!);
  const kind = kinds.includes(chosen) ? chosen : kinds[0]!;
  const mine = types.filter((t) =>
    kind === "pool" ? t.job_type === "maintenance" : t.job_type !== "maintenance",
  );
  const groups: { value: string; label: string; rows: ComponentType[]; footer?: string }[] =
    kind === "pool"
      ? [
          { value: "visit", label: "Every visit", rows: mine.filter((t) => !t.on_schedule) },
          {
            value: "schedule",
            label: "On a schedule",
            rows: mine.filter((t) => t.on_schedule),
            footer: "Each maintenance plan sets how often, from the customer's page.",
          },
        ].filter((g) => g.rows.length)
      : LEAK_SECTIONS.map((v) => ({
          value: v,
          label: CHECKLIST_SECTION_LABELS[v],
          rows: mine.filter((t) => (t.section ?? "plumbing") === v),
        })).filter((g) => g.rows.length);
  const applies = (t: ComponentType) => APPLIES.find((a) => a.value === t.applies_to)?.label;

  return (
    <>
      <SettingsList
        title="Checklist Components"
        subtitle={
          kind === "pool"
            ? "What techs do on every pool visit. Changes apply to new visits; visits already started keep their checklist."
            : "What every leak inspection checks. Changes apply to new jobs; jobs already started keep their checklist."
        }
        addLabel="Add Component"
        onAdd={() => sheet.open("new")}
        notice={sheet.notice}
      >
        {kinds.length > 1 ? (
          <Segmented
            fill={false}
            accessibilityLabel="Checklist"
            value={kind}
            onChange={setChosen}
            options={kinds.map((k) => ({
              value: k,
              label: k === "pool" ? "Pool Visits" : "Leak Inspections",
            }))}
          />
        ) : null}
        <Button title="Add Component" onPress={() => sheet.open("new")} />
        {groups.map((g) => (
          <Section key={g.value} title={g.label} footer={g.footer}>
            <Group>
              {g.rows.map((t) => (
                <ListRow
                  key={t.id}
                  title={t.name}
                  subtitle={
                    kind === "pool"
                      ? applies(t)
                      : [applies(t), t.methods.join(", ")].filter(Boolean).join(" · ") || undefined
                  }
                  detail={t.active ? undefined : "Off"}
                  onPress={() => sheet.open(t)}
                />
              ))}
            </Group>
          </Section>
        ))}
      </SettingsList>
      <EditSheet
        open={sheet.editing != null}
        title={sheet.editing === "new" ? "Add Component" : (sheet.editing?.name ?? "")}
        onClose={sheet.close}
      >
        <TypeForm
          t={sheet.editing === "new" ? undefined : (sheet.editing ?? undefined)}
          kind={kind}
          onDone={sheet.done}
        />
      </EditSheet>
    </>
  );
}

function TypeForm({
  t,
  kind,
  onDone,
}: {
  t?: ComponentType;
  kind: Kind;
  onDone: (m: string) => void;
}) {
  const company = useCompany();
  const visit = kind === "pool";
  const [f, setF] = useState({
    name: t?.name ?? "",
    applies: (t?.applies_to ?? (visit ? "both" : "pool")) as string,
    section: (t?.section && t.section !== "service" ? t.section : "plumbing") as string,
    count: String(t?.default_count ?? 1),
    order: String(t?.sort_order ?? (visit ? 600 : 0)),
    methods: t?.methods.join(", ") ?? "",
    multiple: t?.allows_multiple ?? false,
    schedule: t?.on_schedule ?? false,
    active: t?.active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  function save() {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "Enter a name.";
    const count = toInt(f.count, 1);
    if (count < 0 || count > 50) e.count = "Use 0 to 50.";
    setErrors(e);
    if (Object.keys(e).length) return;
    const methods = f.methods
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    saveConfig(
      "component_type",
      company.id,
      t?.id ?? null,
      {
        name: f.name.trim(),
        allows_multiple: visit ? false : f.multiple,
        default_count: visit ? 1 : count,
        applies_to: f.applies,
        methods: visit ? ["Service"] : methods,
        sort_order: toInt(f.order),
        active: t ? f.active : true,
        on_schedule: visit && f.schedule,
        ...(visit ? {} : { section: f.section }),
        ...(t
          ? {}
          : {
              job_type: visit ? "maintenance" : "detection",
              section: visit ? "service" : f.section,
              answer: visit ? "done" : "leak",
            }),
      },
      t ? undefined : f.name.trim(),
    );
    haptics.success();
    onDone(t ? "Saved." : `Added ${f.name.trim()}.`);
  }

  return (
    <>
      <FieldGroup labelWidth={136}>
        <FieldRow label="Name" value={f.name} onChangeText={set("name")} error={errors.name} />
        {visit ? null : (
          <FieldRow
            label="Starting count"
            value={f.count}
            onChangeText={set("count")}
            keyboardType="number-pad"
            hint="How many a new job starts with."
            error={errors.count}
          />
        )}
        <FieldRow
          label="Order"
          value={f.order}
          onChangeText={set("order")}
          keyboardType="number-pad"
        />
      </FieldGroup>
      {visit ? null : (
        <Select
          label="Section"
          value={f.section}
          onChange={set("section")}
          options={LEAK_SECTIONS.map((v) => ({ value: v, label: CHECKLIST_SECTION_LABELS[v] }))}
        />
      )}
      <Select label="Applies to" value={f.applies} onChange={set("applies")} options={APPLIES} />
      {visit ? null : (
        <FieldGroup footer="Separate with commas, like: Pressure test, Dye test, Visual.">
          <FieldRow
            label="Inspection methods"
            layout="stacked"
            value={f.methods}
            onChangeText={set("methods")}
          />
        </FieldGroup>
      )}
      <FieldGroup
        footer={
          visit
            ? "On a schedule: done every few months, like cleaning the filter. Each maintenance plan sets how often."
            : undefined
        }
      >
        {visit ? (
          <Toggle
            inList
            label="On a schedule"
            value={f.schedule}
            onChange={(v) => setF({ ...f, schedule: v })}
          />
        ) : (
          <Toggle
            inList
            label="Techs can add more than one"
            value={f.multiple}
            onChange={(v) => setF({ ...f, multiple: v })}
          />
        )}
        {t ? (
          <Toggle
            inList
            label={visit ? "On new visits" : "On new checklists"}
            value={f.active}
            onChange={(v) => setF({ ...f, active: v })}
          />
        ) : null}
      </FieldGroup>
      <FormActions
        submit={t ? "Save" : "Add Component"}
        onSubmit={save}
        remove={
          t
            ? {
                label: "Remove Component",
                confirm: `Remove this component from new ${visit ? "visits" : "checklists"}?`,
                onConfirm: () => {
                  removeConfig("component_type", company.id, t.id);
                  onDone("Removed.");
                },
              }
            : undefined
        }
      />
    </>
  );
}
