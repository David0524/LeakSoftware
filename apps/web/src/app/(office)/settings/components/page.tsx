import type { Metadata } from "next";
import Link from "next/link";
import {
  CHECKLIST_SECTION_LABELS,
  INSPECTION_SECTIONS,
  companyServices,
  optionsToText,
  type ChecklistSection,
} from "@leakbook/core";
import { removeConfigRow, saveComponentType } from "@/app/actions/settings";
import {
  SField,
  SSelect,
  SSwitch,
  STextArea,
  SettingsFields,
  SettingsForm,
} from "@/components/settings-forms";
import {
  SettingsAddButton,
  SettingsListPage,
  SheetDanger,
  SheetRow,
} from "@/components/settings-list";
import { Grouped, SEGMENT_TRACK, segmentClass } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany, listConfig, type ComponentType } from "@/lib/data";

export const metadata: Metadata = { title: "Checklist Components · Sundeck Pro" };

const APPLIES = [
  { value: "pool", label: "Pool" },
  { value: "spa", label: "Spa" },
  { value: "both", label: "Pool and spa" },
];

// Pool visits, leak inspections, and pool inspections (2026-10-20).
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

/** A pool inspection question: its words, place, answers, and banner. */
function InspectionFields({ t }: { t?: ComponentType }) {
  const p = t?.id ?? "new";
  return (
    <>
      <input type="hidden" name="job_type" value="inspection" />
      <SettingsFields labelWidth="8.5rem" className="sm:grid sm:grid-cols-2 sm:gap-4">
        <SField
          label="Question"
          name="name"
          id={`name-${p}`}
          defaultValue={t?.name}
          className="sm:col-span-2"
          stacked
          required
        />
        <SSelect
          label="Section"
          name="section"
          id={`section-${p}`}
          defaultValue={t?.section ?? "insp_equipment"}
          options={INSPECTION_SECTIONS.map((v) => ({
            value: v,
            label: CHECKLIST_SECTION_LABELS[v],
          }))}
        />
        <SField
          label="Group"
          name="group_label"
          id={`group-${p}`}
          defaultValue={t?.group_label ?? ""}
          hint="The small header it sits under, like Filtration System."
        />
        <SSelect
          label="Answer"
          name="answer"
          id={`answer-${p}`}
          defaultValue={t?.answer ?? "choice"}
          options={ANSWERS}
        />
        <SField
          label="Order"
          name="sort_order"
          id={`order-${p}`}
          inputMode="numeric"
          defaultValue={t?.sort_order ?? 3500}
        />
      </SettingsFields>
      <SettingsFields>
        <STextArea
          label="Choices"
          name="options"
          id={`options-${p}`}
          rows={4}
          defaultValue={optionsToText(t?.options ?? [{ label: "Yes" }, { label: "No" }])}
          hint="One per line. Add (needs attention), (leaking), or (not applicable) after a choice that means that, and (folds the group) to a first question’s No to fold its group away."
        />
        <STextArea
          label="Banner"
          name="notice"
          id={`notice-${p}`}
          rows={2}
          defaultValue={t?.notice ?? ""}
          hint="Shown above the question and on the report."
        />
      </SettingsFields>
      {t ? (
        <SettingsFields>
          <SSwitch
            label="On new checklists"
            name="active"
            id={`active-${p}`}
            defaultChecked={t.active}
          />
        </SettingsFields>
      ) : null}
    </>
  );
}

const LEAK_SECTIONS: ChecklistSection[] = ["visual", "plumbing", "bond_beam", "other"];

function TypeFields({ t, kind }: { t?: ComponentType; kind: Kind }) {
  const p = t?.id ?? "new";
  if (kind === "inspection") return <InspectionFields t={t} />;
  if (kind === "pool")
    return (
      <>
        <input type="hidden" name="job_type" value="maintenance" />
        <SettingsFields labelWidth="8.5rem" className="sm:grid sm:grid-cols-2 sm:gap-4">
          <SField label="Name" name="name" id={`name-${p}`} defaultValue={t?.name} required />
          <SSelect
            label="Applies to"
            name="applies_to"
            id={`applies-${p}`}
            defaultValue={t?.applies_to ?? "both"}
            options={APPLIES}
          />
          <SField
            label="Order"
            name="sort_order"
            id={`order-${p}`}
            inputMode="numeric"
            defaultValue={t?.sort_order ?? 600}
          />
        </SettingsFields>
        <SettingsFields>
          <SSwitch
            label="On a schedule"
            name="on_schedule"
            id={`schedule-${p}`}
            defaultChecked={t?.on_schedule ?? false}
            hint="Done every few months, like a filter cleaning."
          />
          {t ? (
            <SSwitch
              label="On new visits"
              name="active"
              id={`active-${p}`}
              defaultChecked={t.active}
            />
          ) : null}
        </SettingsFields>
      </>
    );
  return (
    <>
      <input type="hidden" name="job_type" value="detection" />
      <SettingsFields labelWidth="8.5rem" className="sm:grid sm:grid-cols-2 sm:gap-4">
        <SField label="Name" name="name" id={`name-${p}`} defaultValue={t?.name} required />
        <SSelect
          label="Section"
          name="section"
          id={`section-${p}`}
          defaultValue={t?.section && t.section !== "service" ? t.section : "plumbing"}
          options={LEAK_SECTIONS.map((v) => ({ value: v, label: CHECKLIST_SECTION_LABELS[v] }))}
        />
        <SSelect
          label="Applies to"
          name="applies_to"
          id={`applies-${p}`}
          defaultValue={t?.applies_to ?? "pool"}
          options={APPLIES}
        />
        <SField
          label="Starting count"
          name="default_count"
          id={`count-${p}`}
          inputMode="numeric"
          defaultValue={t?.default_count ?? 1}
        />
        <SField
          label="Order"
          name="sort_order"
          id={`order-${p}`}
          inputMode="numeric"
          defaultValue={t?.sort_order ?? 0}
        />
        <SField
          label="Inspection methods"
          name="methods"
          id={`methods-${p}`}
          defaultValue={t?.methods.join(", ") ?? ""}
          hint="Separate with commas, like: Pressure test, Dye test, Visual."
          className="sm:col-span-2"
          stacked
        />
      </SettingsFields>
      <SettingsFields>
        <SSwitch
          label="Techs can add more than one"
          name="allows_multiple"
          id={`multiple-${p}`}
          defaultChecked={t?.allows_multiple ?? false}
        />
        {t ? (
          <SSwitch
            label="On new checklists"
            name="active"
            id={`active-${p}`}
            defaultChecked={t.active}
          />
        ) : null}
      </SettingsFields>
    </>
  );
}

export default async function ComponentsPage({ searchParams }: PageProps<"/settings/components">) {
  const office = await getOffice();
  const [types, company, { list }] = await Promise.all([
    listConfig<ComponentType>(office, "component_type"),
    getCompany(office),
    searchParams,
  ]);
  // Pool visits and leak inspections have their own checklists (owner, 2026-10-16); a shop
  // sees the ones for what it does, and switches between them when it does both.
  const services = companyServices(company.settings);
  const kinds: Kind[] =
    services === "both"
      ? ["pool", "leak", "inspection"]
      : services === "leak"
        ? ["leak", "inspection"]
        : ["pool"];
  const kind: Kind = kinds.includes(list as Kind) ? (list as Kind) : kinds[0]!;
  const mine = types.filter((t) =>
    kind === "pool"
      ? t.job_type === "maintenance"
      : kind === "inspection"
        ? t.job_type === "inspection"
        : (t.job_type ?? "detection") === "detection",
  );
  const groups =
    kind === "pool"
      ? [
          { value: "visit", label: "Every visit", rows: mine.filter((t) => !t.on_schedule) },
          {
            value: "schedule",
            label: "On a schedule",
            rows: mine.filter((t) => t.on_schedule),
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
    <SettingsListPage
      title="Checklist Components"
      subtitle={
        kind === "pool" ? "Changes apply to new visits only." : "Changes apply to new jobs only."
      }
      add={{
        label: "Add Component",
        // The button sits with the list, beside the checklist switch (owner, 2026-10-18:
        // "It's in a hard to find spot").
        inList: true,
        form: (
          <SettingsForm action={saveComponentType} submit="Add Component" primary full>
            <TypeFields kind={kind} />
          </SettingsForm>
        ),
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {kinds.length > 1 ? (
          <nav aria-label="Checklist" className={SEGMENT_TRACK}>
            {kinds.map((k) => (
              <Link
                key={k}
                href={`/settings/components?list=${k}`}
                aria-current={k === kind ? "page" : undefined}
                className={segmentClass(k === kind)}
              >
                {KIND_LABELS[k]}
              </Link>
            ))}
          </nav>
        ) : (
          <span />
        )}
        <SettingsAddButton label="Add Component" />
      </div>
      {groups.map((g) => (
        <Grouped key={g.value} title={g.label}>
          {g.rows.map((t) => (
            <SheetRow
              key={t.id}
              remove={{
                table: "component_type",
                id: t.id,
                path: "/settings/components",
                confirm: `Remove this ${kind === "inspection" ? "question" : "component"} from new ${kind === "pool" ? "visits" : "checklists"}?`,
                confirmLabel: "Remove Component",
              }}
              title={t.name}
              label={t.name}
              detail={
                kind === "inspection"
                  ? [t.group_label, ANSWERS.find((a) => a.value === t.answer)?.label]
                      .filter(Boolean)
                      .join(" · ") || undefined
                  : kind === "pool"
                    ? applies(t)
                    : [applies(t), t.methods.join(", ")].filter(Boolean).join(" · ") || undefined
              }
              value={t.active ? undefined : "Off"}
            >
              <SettingsForm action={saveComponentType} primary full>
                <input type="hidden" name="id" value={t.id} />
                <TypeFields t={t} kind={kind} />
              </SettingsForm>
              <SheetDanger>
                <SettingsForm
                  action={removeConfigRow}
                  submit="Remove Component"
                  danger
                  full
                  confirm={`Remove this ${kind === "inspection" ? "question" : "component"} from new ${kind === "pool" ? "visits" : "checklists"}?`}
                >
                  <input type="hidden" name="table" value="component_type" />
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="path" value="/settings/components" />
                </SettingsForm>
              </SheetDanger>
            </SheetRow>
          ))}
        </Grouped>
      ))}
    </SettingsListPage>
  );
}
