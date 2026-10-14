import type { Metadata } from "next";
import type { ExclusionReason } from "@leakbook/core";
import { removeConfigRow, saveExclusionReason } from "@/app/actions/settings";
import { SField, SettingsForm } from "@/components/settings-forms";
import { Card, Checkbox, PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { listConfig } from "@/lib/data";

export const metadata: Metadata = { title: "Exclusion Reasons · Tidemark" };

export default async function ExclusionsPage() {
  const office = await getOffice();
  const reasons = await listConfig<ExclusionReason>(office, "exclusion_reason");
  return (
    <>
      <PageHeader
        back={{ href: "/settings", label: "Settings" }}
        title="Exclusion Reasons"
        subtitle="Why a component wasn’t inspected. Techs must pick one, and it appears on the report."
      />
      <div className="space-y-4">
        <Card>
          <SettingsForm action={saveExclusionReason} submit="Add Reason" primary>
            <SField label="New reason" name="label" id="label-new" placeholder="Equipment locked" />
          </SettingsForm>
        </Card>
        <Card>
          <ul className="divide-y divide-border">
            {reasons.map((r) => (
              <li key={r.id} className="flex flex-wrap items-end gap-4 py-4">
                <SettingsForm
                  action={saveExclusionReason}
                  inline
                  className="flex flex-1 flex-wrap items-end gap-4"
                >
                  <input type="hidden" name="id" value={r.id} />
                  <SField
                    label="Reason"
                    name="label"
                    id={`label-${r.id}`}
                    defaultValue={r.label}
                    className="min-w-64 flex-1"
                  />
                  <SField
                    label="Order"
                    name="sort_order"
                    id={`order-${r.id}`}
                    inputMode="numeric"
                    defaultValue={r.sort_order}
                    className="w-24"
                  />
                  <Checkbox
                    label="Offered"
                    name="active"
                    id={`active-${r.id}`}
                    defaultChecked={r.active}
                  />
                </SettingsForm>
                <SettingsForm
                  action={removeConfigRow}
                  submit="Remove"
                  danger
                  confirm="Remove this reason?"
                  inline
                  className="flex"
                >
                  <input type="hidden" name="table" value="exclusion_reason" />
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="path" value="/settings/exclusions" />
                </SettingsForm>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
