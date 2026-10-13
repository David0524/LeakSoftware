import type { Metadata } from "next";
import { removeConfigRow, saveComponentType } from "@/app/actions/settings";
import { SField, SettingsForm } from "@/components/settings-forms";
import { Card, Checkbox, PageHeader, Select } from "@/components/ui";
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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SField label="Name" name="name" id={`name-${p}`} defaultValue={t?.name} />
      <Select
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
        className="sm:col-span-2 lg:col-span-4"
      />
      <div className="flex flex-wrap gap-6 sm:col-span-2 lg:col-span-4">
        <Checkbox
          label="Techs can add more than one"
          name="allows_multiple"
          defaultChecked={t?.allows_multiple ?? false}
        />
        {t ? <Checkbox label="On new checklists" name="active" defaultChecked={t.active} /> : null}
      </div>
    </div>
  );
}

export default async function ComponentsPage() {
  const office = await getOffice();
  const types = await listConfig<ComponentType>(office, "component_type");
  return (
    <>
      <PageHeader
        title="Checklist Components"
        subtitle="What every inspection checks. Changes apply to new jobs; jobs already started keep their checklist."
      />
      <div className="space-y-6">
        <Card>
          <h2 className="mb-4 font-display text-xl font-bold">Add a component</h2>
          <SettingsForm action={saveComponentType} submit="Add Component" primary>
            <TypeFields />
          </SettingsForm>
        </Card>
        {types.map((t) => (
          <Card key={t.id}>
            <h2 className="mb-4 font-display text-xl font-bold">
              {t.name}
              {!t.active ? <span className="font-normal text-text-muted"> · off</span> : null}
            </h2>
            <SettingsForm action={saveComponentType}>
              <input type="hidden" name="id" value={t.id} />
              <TypeFields t={t} />
            </SettingsForm>
            <div className="mt-4">
              <SettingsForm
                action={removeConfigRow}
                submit="Remove Component"
                danger
                confirm="Remove this component from new checklists?"
              >
                <input type="hidden" name="table" value="component_type" />
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="path" value="/settings/components" />
              </SettingsForm>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
