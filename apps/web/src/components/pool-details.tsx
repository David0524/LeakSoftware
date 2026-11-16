import {
  HEATER_LABELS,
  POOL_TYPE_LABELS,
  SANITIZER_LABELS,
  type Heater,
  type PoolType,
  type Property,
  type Sanitizer,
} from "@leakbook/core";
import { saveAccessNotes, savePool } from "@/app/actions/jobs";
import { AddressField } from "./address-field";
import { Draft } from "./draft-keeper";
import {
  SettingsFields,
  SettingsForm,
  SField,
  SSelect,
  SSwitch,
  STextArea,
} from "./settings-forms";

/**
 * A pool's details (address; type, gallons, sanitizer, heater, spa, solar heater; access notes;
 * pool notes, kept apart from access notes, owner 2026-11-16) as the edit sheet's form, on the
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
  const sanitizerOptions = [
    { value: "", label: "Not sure" },
    ...(Object.keys(SANITIZER_LABELS) as Sanitizer[]).map((k) => ({
      value: k,
      label: SANITIZER_LABELS[k],
    })),
  ];
  const heaterOptions = [
    { value: "", label: "Not sure" },
    ...(Object.keys(HEATER_LABELS) as Heater[]).map((k) => ({
      value: k,
      label: HEATER_LABELS[k],
    })),
  ];
  return (
    <Draft form="pool-details" id={p.id}>
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
          <SSelect
            label="Sanitizer"
            name="sanitizer"
            defaultValue={p.sanitizer ?? ""}
            options={sanitizerOptions}
          />
          <SSelect
            label="Heater"
            name="heater"
            defaultValue={p.heater ?? ""}
            options={heaterOptions}
          />
          <SSwitch name="has_spa" label="Has a spa" defaultChecked={p.has_spa} />
          <SSwitch
            name="has_solar_heater"
            label="Has a solar heater"
            defaultChecked={Boolean(p.has_solar_heater)}
          />
        </SettingsFields>
        <SettingsFields labelWidth="6.5rem">
          <STextArea
            label="Access notes"
            name="access_notes"
            defaultValue={p.access_notes ?? ""}
            hint="Gate code, pets, where to park."
            maxLength={2000}
          />
        </SettingsFields>
        <SettingsFields labelWidth="6.5rem">
          <STextArea
            label="Pool notes"
            name="notes"
            defaultValue={p.notes ?? ""}
            hint="Equipment, quirks, draining the solar for winter."
            maxLength={2000}
          />
        </SettingsFields>
      </SettingsForm>
    </Draft>
  );
}

/** Just the pool's access notes, in the job page's Access Notes sheet. */
export function AccessNotesForm({ pool: p }: { pool: Pick<Property, "id" | "access_notes"> }) {
  return (
    <Draft form="access-notes" id={p.id}>
      <SettingsForm action={saveAccessNotes} primary full>
        <input type="hidden" name="property" value={p.id} />
        <SettingsFields labelWidth="6.5rem">
          <STextArea
            label="Access notes"
            name="access_notes"
            defaultValue={p.access_notes ?? ""}
            hint="Gate code, pets, where to park."
            maxLength={2000}
          />
        </SettingsFields>
      </SettingsForm>
    </Draft>
  );
}
