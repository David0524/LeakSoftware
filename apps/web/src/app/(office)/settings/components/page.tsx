import type { Metadata } from "next";
import { removeConfigRow, saveComponentType } from "@/app/actions/settings";
import {
  SField,
  SSelect,
  SSwitch,
  SettingsFields,
  SettingsForm,
} from "@/components/settings-forms";
import { SettingsListPage, SheetDanger, SheetRow } from "@/components/settings-list";
import { Grouped } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { listConfig, type ComponentType } from "@/lib/data";

export const metadata: Metadata = { title: "Checklist Components · Tidemark" };

const APPLIES = [
  { value: "pool", label: "Pool" },
  { value: "spa", label: "Spa" },
  { value: "both", label: "Pool and spa" },
];

function TypeFields({ t }: { t?: ComponentType }) {
  const p = t?.id ?? "new";
  return (
    <>
      <SettingsFields labelWidth="8.5rem" className="sm:grid sm:grid-cols-2 sm:gap-4">
        <SField label="Name" name="name" id={`name-${p}`} defaultValue={t?.name} />
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

export default async function ComponentsPage() {
  const office = await getOffice();
  const types = await listConfig<ComponentType>(office, "component_type");
  // Grouped by what they apply to: pool, spa, then both.
  const sections = APPLIES.map((a) => ({
    ...a,
    rows: types.filter(
      (t) => (APPLIES.some((x) => x.value === t.applies_to) ? t.applies_to : "pool") === a.value,
    ),
  })).filter((s) => s.rows.length);
  return (
    <SettingsListPage
      title="Checklist Components"
      subtitle="What every inspection checks. Changes apply to new jobs; jobs already started keep their checklist."
      add={{
        label: "Add Component",
        form: (
          <SettingsForm action={saveComponentType} submit="Add Component" primary full>
            <TypeFields />
          </SettingsForm>
        ),
      }}
    >
      {sections.map((s) => (
        <Grouped key={s.value} title={s.label}>
          {s.rows.map((t) => (
            <SheetRow
              key={t.id}
              title={t.name}
              label={t.name}
              detail={t.methods.length ? t.methods.join(", ") : undefined}
              value={t.active ? undefined : "Off"}
            >
              <SettingsForm action={saveComponentType} primary full>
                <input type="hidden" name="id" value={t.id} />
                <TypeFields t={t} />
              </SettingsForm>
              <SheetDanger>
                <SettingsForm
                  action={removeConfigRow}
                  submit="Remove Component"
                  danger
                  full
                  confirm="Remove this component from new checklists?"
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
