import type { Metadata } from "next";
import { removeConfigRow, saveSeverity } from "@/app/actions/settings";
import {
  ColorField,
  SField,
  SSwitch,
  SettingsFields,
  SettingsForm,
} from "@/components/settings-forms";
import { SettingsListPage, SheetDanger, SheetRow } from "@/components/settings-list";
import { Grouped } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { listConfig, type SeverityLevel } from "@/lib/data";

export const metadata: Metadata = { title: "Severities · Sundeck Pro" };

function SeverityFields({ s }: { s?: SeverityLevel }) {
  const p = s?.id ?? "new";
  return (
    <>
      <SettingsFields labelWidth="5rem" className="sm:grid sm:grid-cols-[1fr_120px] sm:gap-4">
        <SField label="Name" name="name" id={`name-${p}`} defaultValue={s?.name} />
        <SField
          label="Order"
          name="sort_order"
          id={`order-${p}`}
          inputMode="numeric"
          defaultValue={s?.sort_order ?? 0}
        />
      </SettingsFields>
      <SettingsFields>
        <ColorField
          name="color"
          id={`color-${p}`}
          label="Pin color"
          defaultValue={s?.color ?? "#9A6210"}
        />
      </SettingsFields>
      <SettingsFields>
        <SSwitch
          label="Must appear in the report summary"
          name="must_mention"
          id={`mention-${p}`}
          defaultChecked={s?.must_mention ?? false}
        />
        {s ? (
          <SSwitch
            label="Techs can pick this"
            name="active"
            id={`active-${p}`}
            defaultChecked={s.active}
          />
        ) : null}
      </SettingsFields>
    </>
  );
}

export default async function SeveritiesPage() {
  const office = await getOffice();
  const levels = await listConfig<SeverityLevel>(office, "severity_level");
  return (
    <SettingsListPage
      title="Severities"
      subtitle="How serious a finding is. The color is the pin on the pool diagram."
      add={{
        label: "Add Severity",
        form: (
          <SettingsForm action={saveSeverity} submit="Add Severity" primary full>
            <SeverityFields />
          </SettingsForm>
        ),
      }}
    >
      <Grouped>
        {levels.map((s) => (
          <SheetRow
            key={s.id}
            remove={{
              table: "severity_level",
              id: s.id,
              path: "/settings/severities",
              confirm: "Remove this severity?",
              confirmLabel: "Remove Severity",
            }}
            title={s.name}
            label={s.name}
            detail={s.must_mention ? "Always in the report summary" : undefined}
            value={
              <>
                {s.active ? null : "Off"}
                <span
                  className="inline-block size-5 rounded-full"
                  style={{ backgroundColor: s.color }}
                  aria-hidden="true"
                />
              </>
            }
          >
            <SettingsForm action={saveSeverity} primary full>
              <input type="hidden" name="id" value={s.id} />
              <SeverityFields s={s} />
            </SettingsForm>
            <SheetDanger>
              <SettingsForm
                action={removeConfigRow}
                submit="Remove Severity"
                danger
                full
                confirm="Remove this severity?"
              >
                <input type="hidden" name="table" value="severity_level" />
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="path" value="/settings/severities" />
              </SettingsForm>
            </SheetDanger>
          </SheetRow>
        ))}
      </Grouped>
    </SettingsListPage>
  );
}
