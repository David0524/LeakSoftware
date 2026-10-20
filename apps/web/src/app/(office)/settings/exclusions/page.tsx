import type { Metadata } from "next";
import type { ExclusionReason } from "@leakbook/core";
import { removeConfigRow, saveExclusionReason } from "@/app/actions/settings";
import { SField, SSwitch, SettingsFields, SettingsForm } from "@/components/settings-forms";
import { SettingsListPage, SheetDanger, SheetRow } from "@/components/settings-list";
import { Grouped } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { listConfig } from "@/lib/data";

export const metadata: Metadata = { title: "Exclusion Reasons · Sundeck Pro" };

export default async function ExclusionsPage() {
  const office = await getOffice();
  const reasons = await listConfig<ExclusionReason>(office, "exclusion_reason");
  return (
    <SettingsListPage
      title="Exclusion Reasons"
      subtitle="Why a component wasn’t inspected. Techs must pick one, and it appears on the report."
      add={{
        label: "Add Reason",
        form: (
          <SettingsForm action={saveExclusionReason} submit="Add Reason" primary full>
            <SettingsFields labelWidth="7rem">
              <SField
                label="New reason"
                name="label"
                id="label-new"
                placeholder="Equipment locked"
              />
            </SettingsFields>
          </SettingsForm>
        ),
      }}
    >
      <Grouped>
        {reasons.map((r) => (
          <SheetRow
            key={r.id}
            remove={{
              table: "exclusion_reason",
              id: r.id,
              path: "/settings/exclusions",
              confirm: "Remove this reason?",
              confirmLabel: "Remove",
            }}
            title={r.label}
            label={r.label}
            value={r.active ? undefined : "Off"}
          >
            <SettingsForm action={saveExclusionReason} primary full>
              <input type="hidden" name="id" value={r.id} />
              <SettingsFields
                labelWidth="5rem"
                className="sm:grid sm:grid-cols-[1fr_120px] sm:gap-4"
              >
                <SField label="Reason" name="label" id={`label-${r.id}`} defaultValue={r.label} />
                <SField
                  label="Order"
                  name="sort_order"
                  id={`order-${r.id}`}
                  inputMode="numeric"
                  defaultValue={r.sort_order}
                />
              </SettingsFields>
              <SettingsFields>
                <SSwitch
                  label="Offered"
                  name="active"
                  id={`active-${r.id}`}
                  defaultChecked={r.active}
                />
              </SettingsFields>
            </SettingsForm>
            <SheetDanger>
              <SettingsForm
                action={removeConfigRow}
                submit="Remove"
                danger
                full
                confirm="Remove this reason?"
              >
                <input type="hidden" name="table" value="exclusion_reason" />
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="path" value="/settings/exclusions" />
              </SettingsForm>
            </SheetDanger>
          </SheetRow>
        ))}
      </Grouped>
    </SettingsListPage>
  );
}
