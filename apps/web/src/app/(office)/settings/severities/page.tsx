import type { Metadata } from "next";
import { removeConfigRow, saveSeverity } from "@/app/actions/settings";
import { ColorField, SField, SettingsForm } from "@/components/settings-forms";
import { Card, Checkbox, PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { listConfig, type SeverityLevel } from "@/lib/data";

export const metadata: Metadata = { title: "Severities · Tidemark" };

function SeverityFields({ s }: { s?: SeverityLevel }) {
  const p = s?.id ?? "new";
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <SField label="Name" name="name" id={`name-${p}`} defaultValue={s?.name} />
        <SField
          label="Order"
          name="sort_order"
          id={`order-${p}`}
          inputMode="numeric"
          defaultValue={s?.sort_order ?? 0}
        />
      </div>
      <ColorField
        name="color"
        id={`color-${p}`}
        label="Pin color"
        defaultValue={s?.color ?? "#9A6210"}
      />
      <div className="flex flex-wrap gap-6">
        <Checkbox
          label="Must appear in the report summary"
          name="must_mention"
          id={`mention-${p}`}
          defaultChecked={s?.must_mention ?? false}
        />
        {s ? (
          <Checkbox
            label="Techs can pick this"
            name="active"
            id={`active-${p}`}
            defaultChecked={s.active}
          />
        ) : null}
      </div>
    </>
  );
}

export default async function SeveritiesPage() {
  const office = await getOffice();
  const levels = await listConfig<SeverityLevel>(office, "severity_level");
  return (
    <>
      <PageHeader
        back={{ href: "/settings", label: "Settings" }}
        title="Severities"
        subtitle="How serious a finding is. The color is the pin on the pool diagram."
      />
      <div className="space-y-6">
        {levels.map((s) => (
          <Card key={s.id}>
            <h2 className="mb-4 flex items-center gap-3 font-display text-xl font-bold">
              <span
                className="inline-block size-5 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden="true"
              />
              {s.name}
            </h2>
            <SettingsForm action={saveSeverity}>
              <input type="hidden" name="id" value={s.id} />
              <SeverityFields s={s} />
            </SettingsForm>
            <div className="mt-4">
              <SettingsForm
                action={removeConfigRow}
                submit="Remove Severity"
                danger
                confirm="Remove this severity?"
              >
                <input type="hidden" name="table" value="severity_level" />
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="path" value="/settings/severities" />
              </SettingsForm>
            </div>
          </Card>
        ))}
        <Card>
          <h2 className="mb-4 font-display text-xl font-bold">Add a severity</h2>
          <SettingsForm action={saveSeverity} submit="Add Severity" primary>
            <SeverityFields />
          </SettingsForm>
        </Card>
      </div>
    </>
  );
}
