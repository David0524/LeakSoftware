"use client";

import { useRef, useState } from "react";
import {
  POOL_TYPE_LABELS,
  minutesToClock,
  intakeQuestionsFor,
  newJobTypes,
  type IntakeQuestion,
  type JobType,
  type PoolType,
  type DiagramShape,
  type Services,
} from "@leakbook/core";
import { createJobAction } from "@/app/actions/jobs";
import { NewJobRepairs } from "./job-repairs";
import { AddressField } from "./address-field";
import { FieldError, SField, STextArea, SettingsForm } from "./settings-forms";
import { Suggestions } from "./route-board";
import type { RepeatChoice } from "@/lib/plan-repeat";
import { PlanRepeat } from "./plan-repeat";
import { Segmented } from "./segmented";
import { ShapePicker } from "./shape-picker";
import { Checkbox, ChipToggle, cx, SectionTitle, Select } from "./ui";

interface CustomerOption {
  id: string;
  name: string;
  detail: string;
  pools: { id: string; label: string; gallons?: number | null }[];
}

/** A group of fields, as iOS forms draw them: a small gray header over a rounded block. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="pt-3">
      <SectionTitle>
        <span id={id}>{title}</span>
      </SectionTitle>
      <div className="space-y-4 card p-4">{children}</div>
    </section>
  );
}

/** The pool's gallons, saved on the pool (owner, 2026-10-19: it replaced "Size of the pool"). */
function GallonsField({ known }: { known: number | null }) {
  const [value, setValue] = useState(known ? known.toLocaleString("en-US") : "");
  return (
    <SField
      label="Gallons (optional)"
      name="approx_gallons"
      inputMode="numeric"
      placeholder="20,000"
      value={value}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 7);
        setValue(digits ? Number(digits).toLocaleString("en-US") : "");
      }}
      hint="Saved on the pool for the Chemical calculator."
    />
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
  services = "both",
  repairItems = [],
  inspectionFee = null,
}: {
  /** The price book's Pool inspection price, filled in when Pool Inspection is picked. */
  inspectionFee?: number | null;
  /** From the Customer: the price book items a repair can be booked for (owner, 2026-10-19). */
  repairItems?: { id: string; name: string; cents: number }[];
  /** What the shop does: its own jobs, plus Repair for everyone. */
  services?: Services;
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
  const [shape, setShape] = useState<DiagramShape | null>(null);
  const [when, setWhen] = useState<"unscheduled" | "scheduled">("scheduled");
  const [fee, setFee] = useState("");
  // Leak detection, a repair, or maintenance: one visit, or a plan that repeats.
  const [kind, setKind] = useState<JobType>(services === "pool" ? "maintenance" : "detection");
  const [repeat, setRepeat] = useState<RepeatChoice | "0">("0");
  const maintenance = kind === "maintenance";
  const detection = kind === "detection";
  const plan = maintenance && canPlan && repeat !== "0";
  const customer = customers.find((c) => c.id === customerId);
  const newPool = mode === "new" || pool === "new";
  const knownGallons = newPool
    ? null
    : (customer?.pools.find((p) => p.id === pool)?.gallons ?? null);
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
              { value: "new", label: "New" },
              { value: "existing", label: "Existing" },
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
            <AddressField label="Street address" name="address_line1" className="sm:col-span-2" />
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
            {detection || kind === "inspection" ? null : <GallonsField known={null} />}
            <div className={cx("sm:col-span-2", maintenance && "hidden")}>
              <ShapePicker
                name="diagram_shape"
                value={shape}
                onChange={setShape}
                label="Pool shape (optional)"
                hint="Leave it blank if you don’t know yet; it can be set on the job’s Findings."
              />
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
            onChange={(next) => {
              setKind(next);
              if (next === "inspection" && inspectionFee != null && !fee)
                setFee((inspectionFee / 100).toFixed(2));
            }}
            options={newJobTypes(services)}
          />
          {maintenance && canPlan ? <PlanRepeat initial="0" once onChange={setRepeat} /> : null}
          {plan ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <SField
                label="First visit"
                name="date"
                type="date"
                hint={
                  repeat === "days"
                    ? "Visits start on or after this date."
                    : repeat === "monthly"
                      ? "Repeats on this weekday in the same week each month."
                      : "Repeats on this weekday."
                }
              />
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
            // Date, start, and hours on one row, phones included.
            <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1.15fr)_minmax(0,0.6fr)] gap-2 sm:gap-4 [&>*]:min-w-0">
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
            {fees.length && detection ? (
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
            {/* A repair's price is its repairs' (From the Customer). */}
            {kind === "repair" ? null : (
              <SField
                label={plan ? "Price per month ($)" : detection ? "Detection fee ($)" : "Price ($)"}
                name="fee"
                inputMode="decimal"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                hint={
                  maintenance
                    ? "Billed monthly with the customer's other visits."
                    : detection
                      ? "Shown on the report and billed on the invoice."
                      : "Billed on the invoice. Add parts there before sending."
                }
              />
            )}
          </div>
        </div>
      </Section>

      {kind === "repair" ? (
        <Section title="From the Customer">
          {/* One or more repairs (owner, 2026-10-22: "add additional repair"); the job's price
              is their sum. */}
          <NewJobRepairs items={repairItems} />
          <STextArea
            label="What they said (optional)"
            name="notes"
            hint="Shown to the tech with the job."
          />
        </Section>
      ) : detection || kind === "inspection" ? (
        <Section title="From the Customer">
          <GallonsField key={pool} known={knownGallons} />
          {intakeQuestionsFor(questions, kind).map((q) =>
            q.type === "multi" ? (
              <fieldset key={q.key}>
                <legend className="font-medium">{q.label}</legend>
                {/* Tap all that apply (Pool Inspection's features, 2026-10-20). */}
                <div className="mt-2 flex flex-wrap gap-2">
                  {(q.options ?? []).map((o) => (
                    <ChipToggle key={o} name={`q_${q.key}`} value={o} label={o} />
                  ))}
                </div>
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
