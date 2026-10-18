"use client";

import { useState } from "react";
import {
  CLEANING_MONTHS,
  cleaningSummary,
  formatDay,
  planSummary,
  upcomingVisitDates,
  type PlanCleaning,
  type ServicePlan,
} from "@leakbook/core";
import { endPlan, savePlan, setPlanPaused } from "@/app/actions/maintenance";
import { Segmented } from "./segmented";
import { FieldError, SField, SSwitch, STextArea, SettingsForm } from "./settings-forms";
import { SheetRow } from "./settings-list";
import { Grouped, Row, Select } from "./ui";

// Maintenance on the customer's page, per pool (owner request, 2026-10-13): the plan in one
// line, its next visits, and owners can add, change, pause, or end it.

/** A checklist item done on a schedule (Settings › Checklist Components). */
export interface CleaningType {
  id: string;
  name: string;
  /** The price book's price for it, offered for a new cleaning. */
  defaultPriceCents: number | null;
}

interface Props {
  customerId: string;
  propertyId: string;
  plans: (ServicePlan & { cleanings: PlanCleaning[] })[];
  /** Filter and salt cell cleaning, and any other items on a schedule. */
  cleaningTypes: CleaningType[];
  techs: { id: string; name: string }[];
  today: string;
  /** Settings › Scheduling: a new plan's visit length. */
  visitMinutes: number;
  /** Visits done so far, by plan. */
  doneCounts: Record<string, number>;
  canEdit: boolean;
}

export function MaintenancePlans(p: Props) {
  const names = new Map(p.techs.map((t) => [t.id, t.name]));
  const cleaningNames = new Map(p.cleaningTypes.map((t) => [t.id, t.name]));
  return (
    <Grouped
      title="Maintenance"
      footer={p.plans.length === 0 && !p.canEdit ? "No regular cleaning for this pool." : undefined}
    >
      {p.plans.map((plan) => {
        const next = upcomingVisitDates(plan, p.today, 3);
        const detail = [
          plan.assigned_user_id ? (names.get(plan.assigned_user_id) ?? "Teammate") : "No tech yet",
          plan.paused
            ? "Paused"
            : next.length
              ? `Next ${next.map((d) => formatDay(d)).join(", ")}`
              : "No more visits",
          plan.ends_on ? `Ends ${formatDay(plan.ends_on)}` : null,
          `${p.doneCounts[plan.id] ?? 0} done`,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <SheetRow
            key={plan.id}
            testId="plan"
            title="Maintenance Plan"
            label={<span className="font-semibold">{planSummary(plan)}</span>}
            detail={
              <>
                {detail}
                {plan.cleanings.map((c) => (
                  <span key={c.id} className="block">
                    {cleaningSummary(cleaningNames.get(c.component_type_id) ?? "Cleaning", c)} ·{" "}
                    {c.next_due <= p.today ? "due now" : `next ${formatDay(c.next_due)}`}
                  </span>
                ))}
                {plan.notes ? <span className="block">{plan.notes}</span> : null}
              </>
            }
          >
            {p.canEdit ? (
              <div className="space-y-6">
                <div className="flex flex-wrap gap-2">
                  <SettingsForm
                    action={setPlanPaused}
                    submit={plan.paused ? "Resume" : "Pause"}
                    inline
                    className="flex"
                  >
                    <input type="hidden" name="plan" value={plan.id} />
                    <input type="hidden" name="customer" value={p.customerId} />
                    <input type="hidden" name="paused" value={String(!plan.paused)} />
                  </SettingsForm>
                  <SettingsForm
                    action={endPlan}
                    submit="End Plan"
                    inline
                    danger
                    className="flex"
                    confirm="End this plan? Its upcoming visits leave the schedule; finished visits are kept."
                  >
                    <input type="hidden" name="plan" value={plan.id} />
                    <input type="hidden" name="customer" value={p.customerId} />
                  </SettingsForm>
                </div>
                <PlanForm {...p} plan={plan} />
              </div>
            ) : null}
          </SheetRow>
        );
      })}
      {p.canEdit ? (
        <SheetRow
          title="Add Maintenance Plan"
          label={<span className="text-link">Add Maintenance Plan</span>}
        >
          <PlanForm {...p} plan={null} />
        </SheetRow>
      ) : p.plans.length === 0 ? (
        <Row label={<span className="text-text-muted">No regular cleaning</span>} />
      ) : null}
    </Grouped>
  );
}

function PlanForm({
  plan,
  customerId,
  propertyId,
  techs,
  today,
  visitMinutes,
  cleaningTypes,
}: Props & { plan: (ServicePlan & { cleanings: PlanCleaning[] }) | null }) {
  const firstVisit = plan ? (upcomingVisitDates(plan, today, 1)[0] ?? today) : today;
  const [every, setEvery] = useState(String(plan?.interval_weeks ?? 1) as "1" | "2" | "3" | "4");
  return (
    <SettingsForm
      action={savePlan}
      submit={plan ? "Save Plan" : "Add Plan"}
      primary
      full
      className="space-y-3"
    >
      <input type="hidden" name="plan" value={plan?.id ?? ""} />
      <input type="hidden" name="customer" value={customerId} />
      <input type="hidden" name="property" value={propertyId} />
      <Segmented
        label="Repeats"
        name="interval_weeks"
        value={every}
        onChange={setEvery}
        options={[
          { value: "1", label: "Weekly" },
          { value: "2", label: "Every 2 Weeks" },
          { value: "3", label: "Every 3 Weeks" },
          { value: "4", label: "Every 4 Weeks" },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <SField
          label="First visit"
          name="starts_on"
          type="date"
          defaultValue={plan?.starts_on ?? today}
          hint="Visits repeat on this weekday."
        />
        <div>
          <Select
            label="Tech"
            name="tech"
            defaultValue={plan?.assigned_user_id ?? ""}
            options={[
              { value: "", label: "Nobody yet" },
              ...techs.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
          <FieldError name="tech" />
        </div>
        <SField
          label="Time (optional)"
          name="visit_time"
          type="time"
          defaultValue={plan?.visit_time?.slice(0, 5) ?? ""}
          hint="Leave blank and route planning picks it."
        />
        <SField
          label="Visit length (minutes)"
          name="duration_minutes"
          inputMode="numeric"
          defaultValue={String(plan?.duration_minutes ?? visitMinutes)}
        />
        <SField
          label="Price per visit ($)"
          name="price"
          inputMode="decimal"
          defaultValue={plan?.price_cents != null ? (plan.price_cents / 100).toFixed(2) : ""}
        />
        <SField
          label="Last visit (optional)"
          name="ends_on"
          type="date"
          defaultValue={plan?.ends_on ?? ""}
        />
      </div>
      <STextArea
        label="Notes for the tech"
        name="notes"
        defaultValue={plan?.notes ?? ""}
        hint="Gate code, dog in the yard, chemicals to bring."
      />
      {cleaningTypes.length ? (
        <section aria-labelledby={`cleanings-${plan?.id ?? "new"}`} className="space-y-3 pt-2">
          <div>
            <h3 id={`cleanings-${plan?.id ?? "new"}`} className="font-semibold">
              Regular Cleanings
            </h3>
            <p className="text-[0.9375rem] text-text-muted">
              Each goes on the first visit on or after its due date, then repeats from the day
              it&apos;s done. Skipped, it moves to the next visit.
            </p>
          </div>
          {cleaningTypes.map((t) => (
            <CleaningFields
              key={t.id}
              type={t}
              cleaning={plan?.cleanings.find((c) => c.component_type_id === t.id) ?? null}
              firstVisit={firstVisit}
            />
          ))}
        </section>
      ) : null}
    </SettingsForm>
  );
}

function CleaningFields({
  type,
  cleaning,
  firstVisit,
}: {
  type: CleaningType;
  cleaning: PlanCleaning | null;
  firstVisit: string;
}) {
  const [on, setOn] = useState(cleaning !== null);
  const [months, setMonths] = useState(String(cleaning?.every_months ?? 3));
  const price = cleaning ? cleaning.price_cents : type.defaultPriceCents;
  const field = `clean_${type.id}`;
  return (
    <div className="card space-y-3 p-4">
      <input type="hidden" name="cleaning_type" value={type.id} />
      <SSwitch
        label={type.name}
        name={field}
        checked={on}
        onChange={(e) => setOn(e.currentTarget.checked)}
      />
      {on ? (
        <>
          <Segmented
            label="How Often"
            name={`${field}_months`}
            value={months}
            onChange={setMonths}
            options={CLEANING_MONTHS.map((m) => ({
              value: String(m),
              label: m === 1 ? "Monthly" : `Every ${m} Months`,
            }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <SField
              label="Next due"
              name={`${field}_due`}
              type="date"
              defaultValue={cleaning?.next_due ?? firstVisit}
            />
            <SField
              label="Price each time ($)"
              name={`${field}_price`}
              inputMode="decimal"
              defaultValue={price != null ? (price / 100).toFixed(2) : ""}
              hint="Billed on the month's invoice. Blank: the visit price covers it."
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
