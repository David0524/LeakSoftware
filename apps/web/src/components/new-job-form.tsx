"use client";

import { useRef, useState } from "react";
import {
  POOL_TYPE_LABELS,
  minutesToClock,
  type IntakeQuestion,
  type PoolType,
} from "@leakbook/core";
import { createJobAction } from "@/app/actions/jobs";
import { FieldError, SField, STextArea, SettingsForm } from "./settings-forms";
import { Suggestions } from "./route-board";
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
    <section className="space-y-4 card p-5">
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
  lockedTech,
  canPlan = false,
  visitMinutes = 30,
}: {
  customers: CustomerOption[];
  team: { id: string; name: string }[];
  fees: { id: string; name: string; cents: number }[];
  questions: IntakeQuestion[];
  /** A tech who sees only their own jobs books jobs for themselves. */
  lockedTech?: string;
  /** Owners can start a maintenance plan here (recurring visits). */
  canPlan?: boolean;
  /** Settings › Scheduling: a maintenance visit's length. */
  visitMinutes?: number;
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [customerId, setCustomerId] = useState("");
  const [pool, setPool] = useState("new");
  const [when, setWhen] = useState<"unscheduled" | "scheduled">("scheduled");
  const [fee, setFee] = useState("");
  // Leak detection, or maintenance: one visit, or a plan that repeats.
  const [kind, setKind] = useState<"detection" | "maintenance">("detection");
  const [repeat, setRepeat] = useState<"0" | "1" | "2" | "4">("0");
  const maintenance = kind === "maintenance";
  const plan = maintenance && canPlan && repeat !== "0";
  const customer = customers.find((c) => c.id === customerId);
  const newPool = mode === "new" || pool === "new";
  const visit = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState("");

  /** Fill the visit fields from a suggested slot. */
  function fill(values: Record<string, string>) {
    for (const [name, value] of Object.entries(values)) {
      const el = visit.current?.querySelector<HTMLInputElement | HTMLSelectElement>(
        `[name="${name}"]`,
      );
      if (el) el.value = value;
    }
  }

  return (
    <SettingsForm
      action={createJobAction}
      submit={plan ? "Start Plan" : "Create Job"}
      primary
      className="max-w-3xl"
    >
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
        <div ref={visit} className="space-y-4">
          <Segmented
            label="Job"
            name="job_type"
            value={kind}
            onChange={setKind}
            options={[
              { value: "detection", label: "Leak Detection" },
              { value: "maintenance", label: "Maintenance" },
            ]}
          />
          {maintenance && canPlan ? (
            <Segmented
              label="Repeats"
              name="repeat"
              value={repeat}
              onChange={setRepeat}
              options={[
                { value: "0", label: "Just Once" },
                { value: "1", label: "Weekly" },
                { value: "2", label: "Every 2 Weeks" },
                { value: "4", label: "Every 4 Weeks" },
              ]}
            />
          ) : null}
          {plan ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <SField label="First visit" name="date" type="date" hint="Repeats on this weekday." />
              <SField
                label="Time (optional)"
                name="time"
                type="time"
                hint="Blank: route planning picks it."
              />
              <SField
                label="Visit length (minutes)"
                name="minutes"
                inputMode="numeric"
                defaultValue={String(visitMinutes)}
              />
              <SField label="Last visit (optional)" name="ends_on" type="date" />
            </div>
          ) : (
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
          )}
          {!plan && when === "scheduled" && !newPool ? (
            <div>
              <Suggestions
                target={{ property: pool }}
                pickLabel="Use"
                onPick={(s) => {
                  fill({ date: s.date, time: minutesToClock(s.startMin), tech: s.techId });
                  setPicked(`${s.dayLabel} at ${s.timeLabel} with ${s.techName}.`);
                }}
              />
              <p role="status" className="text-[0.9375rem] text-status-pass">
                {picked ? `Filled in: ${picked}` : ""}
              </p>
            </div>
          ) : null}
          {!plan && when === "scheduled" ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <SField label="Date" name="date" type="date" />
              <SField label="Start" name="time" type="time" defaultValue="09:00" />
              <SField
                key={kind}
                label="Hours"
                name="hours"
                inputMode="decimal"
                defaultValue={maintenance ? String(visitMinutes / 60) : "2"}
              />
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Tech"
              name="tech"
              defaultValue={lockedTech ?? ""}
              options={
                lockedTech
                  ? team
                      .filter((t) => t.id === lockedTech)
                      .map((t) => ({ value: t.id, label: t.name }))
                  : [
                      { value: "", label: "Nobody yet" },
                      ...team.map((t) => ({ value: t.id, label: t.name })),
                    ]
              }
            />
            {maintenance ? null : (
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
            )}
            {fees.length && !maintenance ? (
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
              label={plan ? "Price per visit ($)" : maintenance ? "Price ($)" : "Detection fee ($)"}
              name="fee"
              inputMode="decimal"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              hint={
                maintenance
                  ? "Billed monthly with the customer's other visits."
                  : "Shown on the report and billed on the invoice."
              }
            />
          </div>
        </div>
      </Section>

      {questions.length && !maintenance ? (
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
