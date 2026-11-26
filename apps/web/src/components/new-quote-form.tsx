"use client";

import { useState } from "react";
import { createQuoteAction } from "@/app/actions/standalone-quotes";
import { AddressField } from "./address-field";
import { Section } from "./new-job-form";
import { BusinessField } from "./business-popup";
import { businessChoices, hasSecondBusiness, type BusinessCompany } from "@leakbook/core";
import { FieldError, SField, SettingsForm } from "./settings-forms";
import { Segmented } from "./segmented";
import { Select } from "./ui";

export interface QuoteCustomerOption {
  id: string;
  name: string;
  detail: string;
  pools: { id: string; label: string }[];
}

/** A new address for the quote's pool: Street, City, State, ZIP (all optional together). */
export function PoolAddressFields() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <AddressField label="Street" name="address_line1" className="sm:col-span-2" />
      <SField label="City" name="city" />
      <div className="grid grid-cols-2 gap-4">
        <SField label="State" name="state" maxLength={2} />
        <SField label="ZIP" name="postal_code" />
      </div>
    </div>
  );
}

/**
 * New Quote (docs/design/2026-11-24-standalone-quotes.md): a customer, new or picked as New
 * Job picks one, and an optional pool. Create Quote opens the Quote screen in its place.
 */
export function NewQuoteForm({
  customers,
  customerId: picked = "",
  business = null,
}: {
  customers: QuoteCustomerOption[];
  /** The shop's two businesses (2026-11-26): a Business row when it has a second one. */
  business?: BusinessCompany | null;
  /** Opened from a customer page: that customer, already picked. */
  customerId?: string;
}) {
  const startsPicked = customers.some((c) => c.id === picked);
  const [mode, setMode] = useState<"new" | "existing">(startsPicked ? "existing" : "new");
  const [customerId, setCustomerId] = useState(startsPicked ? picked : "");
  const customer = mode === "existing" ? customers.find((c) => c.id === customerId) : undefined;
  const firstPool = (c: QuoteCustomerOption | undefined) =>
    c?.pools.length === 1 ? c.pools[0]!.id : "new";
  const [pool, setPool] = useState(firstPool(customer));
  const newPool = !customer?.pools.length || pool === "new";

  return (
    <SettingsForm action={createQuoteAction} submit="Create Quote" className="max-w-3xl">
      <Section title="Customer">
        {customers.length ? (
          <Segmented
            label="Who is it for?"
            name="customer_mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "new", label: "New" },
              { value: "existing", label: "Existing" },
            ]}
          />
        ) : (
          <input type="hidden" name="customer_mode" value="new" />
        )}
        {mode === "existing" ? (
          <div className="space-y-1">
            <Select
              label="Customer"
              name="customer"
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setPool(firstPool(customers.find((c) => c.id === e.target.value)));
              }}
              options={[
                { value: "", label: "Choose…" },
                ...customers.map((c) => ({
                  value: c.id,
                  label: c.detail ? `${c.name} (${c.detail})` : c.name,
                })),
              ]}
            />
            <FieldError name="customer" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <SField label="Name" name="customer_name" autoComplete="off" />
            <SField label="Phone" name="customer_phone" type="tel" />
            <SField label="Email" name="customer_email" type="email" />
          </div>
        )}
      </Section>

      {/* A quote on its own uses the main business unless picked (2026-11-26). */}
      {business && hasSecondBusiness(business) ? (
        <div className="pt-3">
          <div className="card p-4">
            <BusinessField auto="main" choices={businessChoices(business)} />
          </div>
        </div>
      ) : null}

      <Section
        title="Pool (Optional)"
        footer={newPool ? "Leave the address blank to quote without one." : undefined}
      >
        {customer?.pools.length ? (
          <div className="space-y-1">
            <Select
              label="Pool"
              name="property"
              value={pool}
              onChange={(e) => setPool(e.target.value)}
              options={[
                ...customer.pools.map((p) => ({ value: p.id, label: p.label })),
                { value: "new", label: "New address…" },
              ]}
            />
            <FieldError name="property" />
          </div>
        ) : (
          <input type="hidden" name="property" value="new" />
        )}
        {newPool ? <PoolAddressFields /> : null}
      </Section>
    </SettingsForm>
  );
}
