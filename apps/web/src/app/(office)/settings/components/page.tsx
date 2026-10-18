import type { Metadata } from "next";
import Link from "next/link";
import { CHECKLIST_SECTION_LABELS, companyServices, type ChecklistSection } from "@leakbook/core";
import { removeConfigRow, saveComponentType } from "@/app/actions/settings";
import {
  SField,
  SSelect,
  SSwitch,
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

export const metadata: Metadata = { title: "Checklist Components · Tidemark" };

const APPLIES = [
  { value: "pool", label: "Pool" },
  { value: "spa", label: "Spa" },
  { value: "both", label: "Pool and spa" },
];

type Kind = "pool" | "leak";

const LEAK_SECTIONS: ChecklistSection[] = ["visual", "plumbing", "bond_beam", "other"];

function TypeFields({ t, kind }: { t?: ComponentType; kind: Kind }) {
  const p = t?.id ?? "new";
  if (kind === "pool")
    return (
      <>
        <input type="hidden" name="job_type" value="maintenance" />
        <SettingsFields labelWidth="8.5rem" className="sm:grid sm:grid-cols-2 sm:gap-4">
          <SField label="Name" name="name" id={`name-${p}`} defaultValue={t?.name} />
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
            hint="Done every few months, like cleaning the filter. Each maintenance plan sets how often."
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
        <SField label="Name" name="name" id={`name-${p}`} defaultValue={t?.name} />
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
          hint="How many a new job starts with."
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
  const kinds: Kind[] = services === "both" ? ["pool", "leak"] : [services];
  const kind: Kind = kinds.includes(list as Kind) ? (list as Kind) : kinds[0]!;
  const mine = types.filter((t) =>
    kind === "pool" ? t.job_type === "maintenance" : t.job_type !== "maintenance",
  );
  const groups =
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
    <SettingsListPage
      title="Checklist Components"
      subtitle={
        kind === "pool"
          ? "What techs do on every pool visit. Changes apply to new visits; visits already started keep their checklist."
          : "What every leak inspection checks. Changes apply to new jobs; jobs already started keep their checklist."
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
                {k === "pool" ? "Pool Visits" : "Leak Inspections"}
              </Link>
            ))}
          </nav>
        ) : (
          <span />
        )}
        <SettingsAddButton label="Add Component" />
      </div>
      {groups.map((g) => (
        <Grouped key={g.value} title={g.label} footer={"footer" in g ? g.footer : undefined}>
          {g.rows.map((t) => (
            <SheetRow
              key={t.id}
              title={t.name}
              label={t.name}
              detail={
                kind === "pool"
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
                  confirm={`Remove this component from new ${kind === "pool" ? "visits" : "checklists"}?`}
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
