"use client";

import { useState } from "react";
import { POOL_TYPE_LABELS, type IntakeQuestion, type PoolType } from "@leakbook/core";
import { createJobAction } from "@/app/actions/jobs";
import { FieldError, SField, STextArea, SettingsForm } from "./settings-forms";
import { Segmented } from "./segmented";
import { Checkbox, Select } from "./ui";

interface CustomerOption {
  id: string;
  name: string;
  detail: string;
  pools: { id: string; label: string }[];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function NewJobForm({
  customers,
  team,
  fees,
  questions,
}: {
  customers: CustomerOption[];
  team: { id: string; name: string }[];
  fees: { id: string; name: string; cents: number }[];
  questions: IntakeQuestion[];
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [customerId, setCustomerId] = useState("");
  const [pool, setPool] = useState("new");
  const [when, setWhen] = useState<"unscheduled" | "scheduled">("scheduled");
  const [fee, setFee] = useState("");
  const customer = customers.find((c) => c.id === customerId);
  const newPool = mode === "new" || pool === "new";

  return (
    <SettingsForm action={createJobAction} submit="Create Job" primary className="max-w-3xl">
      <Section title="Customer">
        {customers.length ? (
          <Segmented
            label="Who is it for?"
            name="customer_mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "new", label: "New Customer" },
              { value: "existing", label: "Existing Customer" },
            ]}
          />
        ) : (
          <input type="hidden" name="customer_mode" value="new" />
        )}
        {mode === "existing" ? (
          <div className="space-y-4">
            <Select
              label="Customer"
              name="customer"
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                const next = customers.find((c) => c.id === e.target.value);
                setPool(next?.pools.length === 1 ? next.pools[0]!.id : "new");
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
            {customer ? (
              <Select
                label="Pool"
                name="property"
                value={pool}
                onChange={(e) => setPool(e.target.value)}
                options={[
                  ...customer.pools.map((p) => ({ value: p.id, label: p.label })),
                  { value: "new", label: "Another address…" },
                ]}
              />
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <SField label="Name" name="customer_name" autoComplete="off" />
            <SField label="Phone" name="customer_phone" type="tel" />
            <SField label="Email" name="customer_email" type="email" />
            <SField
              label="Other emails (optional)"
              name="cc_emails"
              hint="They get reports too. Separate with spaces."
            />
          </div>
        )}
      </Section>

      {newPool ? (
        <Section title="Pool">
          <div className="grid gap-4 sm:grid-cols-2">
            <SField label="Street address" name="address_line1" className="sm:col-span-2" />
            <SField label="City" name="city" />
            <div className="grid grid-cols-2 gap-4">
              <SField label="State" name="state" maxLength={2} />
              <SField label="ZIP" name="postal_code" />
            </div>
            <Select
              label="Pool type"
              name="pool_type"
              defaultValue=""
              options={[
                { value: "", label: "Not sure" },
                ...(Object.keys(POOL_TYPE_LABELS) as PoolType[]).map((k) => ({
                  value: k,
                  label: POOL_TYPE_LABELS[k],
                })),
              ]}
            />
            <div className="self-end">
              <Checkbox name="has_spa" label="Has a spa" />
            </div>
            <div className="sm:col-span-2">
              <STextArea
                label="Access notes (optional)"
                name="access_notes"
                hint="Gate code, dog, where to park."
              />
            </div>
          </div>
        </Section>
      ) : null}

      <Section title="Visit">
        <Segmented
          label="When"
          name="when"
          value={when}
          onChange={setWhen}
          options={[
            { value: "scheduled", label: "Scheduled" },
            { value: "unscheduled", label: "Not Yet" },
          ]}
        />
        {when === "scheduled" ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <SField label="Date" name="date" type="date" />
            <SField label="Start" name="time" type="time" defaultValue="09:00" />
            <SField label="Hours" name="hours" inputMode="decimal" defaultValue="2" />
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Tech"
            name="tech"
            defaultValue=""
            options={[
              { value: "", label: "Nobody yet" },
              ...team.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
          <div>
            <Select
              label="Second tech (optional)"
              name="second_tech"
              defaultValue=""
              options={[
                { value: "", label: "None" },
                ...team.map((t) => ({ value: t.id, label: t.name })),
              ]}
            />
            <FieldError name="second_tech" />
          </div>
          {fees.length ? (
            <Select
              label="Detection price"
              name="fee_item"
              defaultValue=""
              onChange={(e) => {
                const item = fees.find((f) => f.id === e.target.value);
                if (item) setFee((item.cents / 100).toFixed(2));
              }}
              options={[
                { value: "", label: "Pick from the price book…" },
                ...fees.map((f) => ({
                  value: f.id,
                  label: `${f.name} ($${(f.cents / 100).toFixed(2)})`,
                })),
              ]}
            />
          ) : null}
          <SField
            label="Detection fee ($)"
            name="fee"
            inputMode="decimal"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            hint="Shown on the report and billed on the invoice."
          />
        </div>
      </Section>

      {questions.length ? (
        <Section title="When They Called">
          {questions.map((q) =>
            q.type === "multi" ? (
              <fieldset key={q.key}>
                <legend className="font-medium">{q.label}</legend>
                {(q.options ?? []).map((o) => (
                  <Checkbox key={o} name={`q_${q.key}`} value={o} label={o} />
                ))}
              </fieldset>
            ) : q.type === "single" ? (
              <Select
                key={q.key}
                label={q.label}
                name={`q_${q.key}`}
                defaultValue=""
                options={[
                  { value: "", label: "Not asked" },
                  ...(q.options ?? []).map((o) => ({ value: o, label: o })),
                ]}
              />
            ) : (
              <SField key={q.key} label={q.label} name={`q_${q.key}`} />
            ),
          )}
          <STextArea label="Notes for the tech (optional)" name="notes" />
        </Section>
      ) : (
        <Section title="Notes">
          <STextArea label="Notes for the tech (optional)" name="notes" />
        </Section>
      )}
    </SettingsForm>
  );
}
