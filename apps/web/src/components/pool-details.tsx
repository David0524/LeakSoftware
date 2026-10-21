import { POOL_TYPE_LABELS, type PoolType, type Property } from "@leakbook/core";
import { saveAccessNotes, savePool } from "@/app/actions/jobs";
import { AddressField } from "./address-field";
import {
  SettingsFields,
  SettingsForm,
  SField,
  SSelect,
  SSwitch,
  STextArea,
} from "./settings-forms";

/**
 * A pool's details (address, type, gallons, spa, access notes) as the edit sheet's form, on the
 * customer's page and the job's (owner, 2026-10-20: the job's address "should open up the
 * screen to edit it").
 */
export function PoolDetailsForm({ pool: p }: { pool: Property }) {
  const poolOptions = [
    { value: "", label: "Not sure" },
    ...(Object.keys(POOL_TYPE_LABELS) as PoolType[]).map((k) => ({
      value: k,
      label: POOL_TYPE_LABELS[k],
    })),
  ];
  return (
    <SettingsForm action={savePool} primary full>
      <input type="hidden" name="property" value={p.id} />
      <SettingsFields labelWidth="6.5rem">
        <AddressField
          label="Street"
          name="address_line1"
          defaultValue={p.address_line1 ?? ""}
          autoComplete="off"
          required
        />
        <SField
          label="Unit"
          name="address_line2"
          defaultValue={p.address_line2 ?? ""}
          placeholder="Optional"
          autoComplete="off"
        />
        <SField label="City" name="city" defaultValue={p.city ?? ""} autoComplete="off" />
        <SField
          label="State"
          name="state"
          defaultValue={p.state ?? ""}
          maxLength={2}
          autoComplete="off"
        />
        <SField
          label="ZIP"
          name="postal_code"
          defaultValue={p.postal_code ?? ""}
          inputMode="numeric"
          autoComplete="off"
        />
      </SettingsFields>
      <SettingsFields labelWidth="6.5rem">
        <SSelect
          label="Pool type"
          name="pool_type"
          defaultValue={p.pool_type ?? ""}
          options={poolOptions}
        />
        <SField
          label="Gallons"
          name="approx_gallons"
          defaultValue={p.approx_gallons ? p.approx_gallons.toLocaleString("en-US") : ""}
          inputMode="numeric"
          placeholder="20,000"
          autoComplete="off"
        />
        <SSwitch name="has_spa" label="Has a spa" defaultChecked={p.has_spa} />
        <STextArea
          label="Access notes"
          name="access_notes"
          defaultValue={p.access_notes ?? ""}
          hint="Gate code, dog, where to park."
        />
      </SettingsFields>
    </SettingsForm>
  );
}

/** Just the pool's access notes, in the job page's Access Notes sheet. */
export function AccessNotesForm({ pool: p }: { pool: Pick<Property, "id" | "access_notes"> }) {
  return (
    <SettingsForm action={saveAccessNotes} primary full>
      <input type="hidden" name="property" value={p.id} />
      <SettingsFields labelWidth="6.5rem">
        <STextArea
          label="Access notes"
          name="access_notes"
          defaultValue={p.access_notes ?? ""}
          hint="Gate code, dog, where to park."
          maxLength={2000}
        />
      </SettingsFields>
    </SettingsForm>
  );
}
