import { useState } from "react";
import {
  CHECKLIST_SECTION_LABELS,
  INSPECTION_SECTIONS,
  companyServices,
  optionsFromText,
  optionsToText,
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
import { useRowMenu } from "../../ui/RowMenu";
import { EditSheet, FormActions, ManagersOnly, SettingsList, useEditSheet } from "./SettingsList";

// Settings › Checklist Components (the website's settings/components): pool visits, leak
// inspections and pool inspections (2026-10-20) have their own checklists; a shop that does
// more than one switches between them.

const APPLIES = [
  { value: "pool", label: "Pool" },
  { value: "spa", label: "Spa" },
  { value: "both", label: "Pool and spa" },
];
type Kind = "pool" | "leak" | "inspection";

const KIND_LABELS: Record<Kind, string> = {
  pool: "Pool Visits",
  leak: "Leak Inspections",
  inspection: "Pool Inspections",
};

const ANSWERS = [
  { value: "choice", label: "One choice" },
  { value: "multi", label: "Several choices" },
  { value: "text", label: "Text" },
];
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
  // Touch and hold a row for Edit and its delete (gestures spec section 12).
  const menu = useRowMenu();
  const services = companyServices(company.settings);
  const kinds: Kind[] =
    services === "both"
      ? ["pool", "leak", "inspection"]
      : services === "leak"
        ? ["leak", "inspection"]
        : ["pool"];
  const [chosen, setChosen] = useState<Kind>(kinds[0]!);
  const kind = kinds.includes(chosen) ? chosen : kinds[0]!;
  const mine = types.filter((t) =>
    kind === "pool"
      ? t.job_type === "maintenance"
      : kind === "inspection"
        ? t.job_type === "inspection"
        : (t.job_type ?? "detection") === "detection",
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
      : (kind === "inspection" ? INSPECTION_SECTIONS : LEAK_SECTIONS)
          .map((v) => ({
            value: v,
            label: CHECKLIST_SECTION_LABELS[v],
            rows: mine.filter((t) => (t.section ?? "plumbing") === v),
          }))
          .filter((g) => g.rows.length);
  const applies = (t: ComponentType) => APPLIES.find((a) => a.value === t.applies_to)?.label;

  return (
    <>
      <SettingsList
        title="Checklist Components"
        subtitle={
          kind === "pool"
            ? "What techs do on every pool visit. Changes apply to new visits; visits already started keep their checklist."
            : kind === "inspection"
              ? "Every question of a pool inspection. Changes apply to new jobs; jobs already started keep their checklist."
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
              label: KIND_LABELS[k],
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
                    kind === "inspection"
                      ? [t.group_label, ANSWERS.find((a) => a.value === t.answer)?.label]
                          .filter(Boolean)
                          .join(" · ") || undefined
                      : kind === "pool"
                        ? applies(t)
                        : [applies(t), t.methods.join(", ")].filter(Boolean).join(" · ") ||
                          undefined
                  }
                  detail={t.active ? undefined : "Off"}
                  onPress={() => sheet.open(t)}
                  editMenu={{ menu, title: t.name }}
                />
              ))}
            </Group>
          </Section>
        ))}
      </SettingsList>
      {menu.element}
      <EditSheet
        open={sheet.editing != null}
        title={sheet.editing === "new" ? "Add Component" : (sheet.editing?.name ?? "")}
        onClose={sheet.close}
      >
        {kind === "inspection" ? (
          <QuestionForm
            t={sheet.editing === "new" ? undefined : (sheet.editing ?? undefined)}
            onDone={sheet.done}
          />
        ) : (
          <TypeForm
            t={sheet.editing === "new" ? undefined : (sheet.editing ?? undefined)}
            kind={kind}
            onDone={sheet.done}
          />
        )}
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
  kind: Exclude<Kind, "inspection">;
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

/**
 * A pool inspection question (2026-10-20), as the website's: its words, section, group, answer
 * kind, choices with what they mean, and banner. Written through the sync layer.
 */
function QuestionForm({ t, onDone }: { t?: ComponentType; onDone: (m: string) => void }) {
  const company = useCompany();
  const [f, setF] = useState({
    name: t?.name ?? "",
    section: (t?.section && INSPECTION_SECTIONS.includes(t.section)
      ? t.section
      : "insp_equipment") as string,
    group: t?.group_label ?? "",
    answer: (t?.answer === "multi" || t?.answer === "text" ? t.answer : "choice") as string,
    order: String(t?.sort_order ?? 3500),
    options: optionsToText(t?.options ?? [{ label: "Yes" }, { label: "No" }]),
    notice: t?.notice ?? "",
    active: t?.active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  function save() {
    const e: Record<string, string> = {};
    const name = f.name.trim();
    if (!name) e.name = "Enter a name.";
    const options = f.answer === "text" ? null : optionsFromText(f.options);
    if (options && options.length < 2) e.options = "Enter at least two choices.";
    setErrors(e);
    if (Object.keys(e).length) return;
    saveConfig(
      "component_type",
      company.id,
      t?.id ?? null,
      {
        name,
        section: f.section,
        answer: f.answer,
        options: options ? options.map((o) => ({ ...o })) : null,
        group_label: f.group.trim() || null,
        notice: f.notice.trim() || null,
        sort_order: toInt(f.order),
        active: t ? f.active : true,
        ...(t
          ? {}
          : {
              job_type: "inspection",
              applies_to: "both",
              methods: ["Visual"],
              allows_multiple: false,
              default_count: 1,
              on_schedule: false,
            }),
      },
      t ? undefined : name,
    );
    haptics.success();
    onDone(t ? "Saved." : `Added ${name}.`);
  }

  return (
    <>
      <FieldGroup labelWidth={136}>
        <FieldRow
          label="Question"
          layout="stacked"
          value={f.name}
          onChangeText={set("name")}
          error={errors.name}
        />
      </FieldGroup>
      <Select
        label="Section"
        value={f.section}
        onChange={set("section")}
        options={INSPECTION_SECTIONS.map((v) => ({
          value: v,
          label: CHECKLIST_SECTION_LABELS[v],
        }))}
      />
      <FieldGroup labelWidth={136} footer="The small header it sits under, like Filtration System.">
        <FieldRow label="Group" value={f.group} onChangeText={set("group")} />
      </FieldGroup>
      <Select label="Answer" value={f.answer} onChange={set("answer")} options={ANSWERS} />
      <FieldGroup labelWidth={136}>
        <FieldRow
          label="Order"
          value={f.order}
          onChangeText={set("order")}
          keyboardType="number-pad"
        />
      </FieldGroup>
      {f.answer === "text" ? null : (
        <FieldGroup
          title="Choices"
          footer="One per line. Add (needs attention), (leaking), or (not applicable) after a choice that means that, and (folds the group) to a first question’s No to fold its group away."
        >
          <FieldRow
            label="Choices"
            multiline
            value={f.options}
            onChangeText={set("options")}
            error={errors.options}
          />
        </FieldGroup>
      )}
      <FieldGroup
        title="Banner"
        footer="Shown above the question, and as a recommendation on the report."
      >
        <FieldRow label="Banner" multiline value={f.notice} onChangeText={set("notice")} />
      </FieldGroup>
      {t ? (
        <FieldGroup>
          <Toggle
            inList
            label="On new checklists"
            value={f.active}
            onChange={(v) => setF({ ...f, active: v })}
          />
        </FieldGroup>
      ) : null}
      <FormActions
        submit={t ? "Save" : "Add Component"}
        onSubmit={save}
        remove={
          t
            ? {
                label: "Remove Component",
                confirm: "Remove this question from new checklists?",
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
