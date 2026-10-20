import { POOL_TYPE_LABELS, type PoolType, type Property } from "@leakbook/core";
import { useState } from "react";
import { useAddressSuggestions } from "../address/AddressSuggestions";
import { locateAfterSync } from "../../lib/locate";
import { getServices } from "../../lib/services";
import { useCompany } from "../../state/session";
import { Button, FieldGroup, FieldRow, Toggle } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { Select } from "../../ui/Select";

/**
 * A pool's details (the website's pool-details.tsx): the street with address suggestions, unit,
 * city, state, ZIP, pool type, gallons, spa and access notes. Saved through sync; a new address
 * drops the old map location and looks the new one up once it's up. Used by the customer page
 * and the job page's Pool group (owner, 2026-10-20).
 */
export function PoolForm({ pool, onSaved }: { pool: Property; onSaved: () => void }) {
  const company = useCompany();
  const [f, setF] = useState({
    address_line1: pool.address_line1 ?? "",
    address_line2: pool.address_line2 ?? "",
    city: pool.city ?? "",
    state: pool.state ?? "",
    postal_code: pool.postal_code ?? "",
    pool_type: (pool.pool_type ?? "") as string,
    has_spa: Boolean(pool.has_spa),
    approx_gallons: pool.approx_gallons ? pool.approx_gallons.toLocaleString("en-US") : "",
    access_notes: pool.access_notes ?? "",
  });
  const [error, setError] = useState<string | undefined>();
  const [gallonsError, setGallonsError] = useState<string | undefined>();
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  // Real addresses as the street is typed (owner, 2026-10-20); picking one fills the rest.
  const suggestions = useAddressSuggestions(f.address_line1, (s) =>
    setF((x) => ({
      ...x,
      address_line1: s.line1,
      city: s.city,
      state: s.state,
      postal_code: s.postal_code,
    })),
  );

  function save() {
    setError(undefined);
    setGallonsError(undefined);
    if (!f.address_line1.trim()) {
      setError("Enter the street address.");
      return;
    }
    // Gallons as typed ("20,000", "20000"); blank clears it (owner, 2026-10-19), as the website.
    const gallonsText = f.approx_gallons.replace(/[,\s]/g, "");
    const gallons = gallonsText ? Math.round(Number(gallonsText)) : null;
    if (gallons !== null && !(Number.isFinite(gallons) && gallons > 0 && gallons < 10_000_000)) {
      setGallonsError("Enter the gallons as a number, like 20,000.");
      return;
    }
    const address = {
      address_line1: f.address_line1.trim(),
      address_line2: f.address_line2.trim() || null,
      city: f.city.trim() || null,
      state: f.state.trim().toUpperCase() || null,
      postal_code: f.postal_code.trim() || null,
    };
    // A new address drops the old map location: it belonged to the old address.
    const moved = (Object.keys(address) as (keyof typeof address)[]).some(
      (k) => (pool[k] ?? null) !== address[k],
    );
    getServices().sync.write("property", pool.id, company.id, {
      ...address,
      pool_type: f.pool_type || null,
      has_spa: f.has_spa,
      approx_gallons: gallons,
      access_notes: f.access_notes.trim() || null,
      ...(moved
        ? { latitude: null, longitude: null, geocoded_address: null, location_source: null }
        : {}),
    });
    // Once it's up, the server finds the new address on the map.
    if (moved) void locateAfterSync(company.id, { property_id: pool.id });
    haptics.success();
    onSaved();
  }

  return (
    <>
      <FieldGroup labelWidth={104}>
        <FieldRow
          label="Street"
          value={f.address_line1}
          onChangeText={set("address_line1")}
          error={error}
        />
        {suggestions}
        <FieldRow
          label="Unit"
          value={f.address_line2}
          onChangeText={set("address_line2")}
          placeholder="Optional"
        />
        <FieldRow label="City" value={f.city} onChangeText={set("city")} />
        <FieldRow
          label="State"
          value={f.state}
          onChangeText={set("state")}
          maxLength={2}
          autoCapitalize="characters"
        />
        <FieldRow
          label="ZIP"
          value={f.postal_code}
          onChangeText={set("postal_code")}
          keyboardType="number-pad"
        />
      </FieldGroup>
      <Select
        label="Pool type"
        value={f.pool_type}
        onChange={set("pool_type")}
        options={[
          { value: "", label: "Not sure" },
          ...(Object.keys(POOL_TYPE_LABELS) as PoolType[]).map((k) => ({
            value: k,
            label: POOL_TYPE_LABELS[k],
          })),
        ]}
      />
      <FieldGroup footer="Gate code, dog, where to park.">
        <FieldRow
          label="Gallons"
          value={f.approx_gallons}
          onChangeText={set("approx_gallons")}
          keyboardType="number-pad"
          placeholder="20,000"
          error={gallonsError}
        />
        <Toggle
          inList
          label="Has a spa"
          value={f.has_spa}
          onChange={(v) => setF({ ...f, has_spa: v })}
        />
        <FieldRow
          label="Access notes"
          value={f.access_notes}
          onChangeText={set("access_notes")}
          multiline
        />
      </FieldGroup>
      <Button title="Save" wide onPress={save} />
    </>
  );
}
