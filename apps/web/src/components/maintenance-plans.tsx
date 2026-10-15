"use client";

import { useState } from "react";
import { formatDay, planSummary, upcomingVisitDates, type ServicePlan } from "@leakbook/core";
import { endPlan, savePlan, setPlanPaused } from "@/app/actions/maintenance";
import { Segmented } from "./segmented";
import { FieldError, SField, STextArea, SettingsForm } from "./settings-forms";
import { SheetRow } from "./settings-list";
import { Grouped, Row, Select } from "./ui";

// Maintenance on the customer's page, per pool (owner request, 2026-10-13): the plan in one
// line, its next visits, and owners can add, change, pause, or end it.

interface Props {
  customerId: string;
  propertyId: string;
  plans: ServicePlan[];
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
}: Props & { plan: ServicePlan | null }) {
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
    </SettingsForm>
  );
}
