import {
  cleaningCountdown,
  cleaningSummary,
  filterAge,
  formatDay,
  maintenanceSettings,
  planRepeat,
  planSummary,
  upcomingVisitDates,
  type PlanRepeat as Repeat,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ServicePlanRow } from "../../data/customers";
import { useInspectionConfig } from "../../data/inspection";
import { getServices } from "../../lib/services";
import { useCompany } from "../../state/session";
import { Button, Field, Group, ListRow, Section, T } from "../../ui/components";
import { confirmDestructive } from "../../ui/confirm";
import { haptics } from "../../ui/haptics";
import { ModalSheet, useUnsavedChanges } from "../../ui/ModalSheet";
import { Select } from "../../ui/Select";
import { color, face, MAX_TEXT_SCALE, space, type } from "../../ui/theme";
import { CleaningIcon, cleaningType, usePlanCleanings } from "./Cleanings";
import { DateField, TimeField } from "../schedule/DateField";
import { checkPlan, firstVisitHint, type PlanErrors } from "./plan";
import { PlanRepeat } from "./PlanRepeat";
import { formChanged } from "../../lib/discard";

type Plan = ServicePlanRow & { notes?: string | null };

/**
 * A pool's maintenance plans on the customer's page (the website's MaintenancePlans): each
 * plan in one line with its tech, next visits, and visits done; owners and admins add, change,
 * pause, or end them in a sheet. Plans are synced rows, so edits save through the sync layer
 * and the server makes or replaces the plan's visits when they arrive.
 */
export function MaintenancePlans({
  customerId,
  propertyId,
  plans,
  techs,
  today,
  doneCounts,
  canEdit,
  onNotice,
}: {
  customerId: string;
  propertyId: string;
  plans: Plan[];
  techs: { id: string; name: string }[];
  today: string;
  /** Visits done so far, by plan. */
  doneCounts: Record<string, number>;
  canEdit: boolean;
  /** What the last sheet did, shown at the top of the page. */
  onNotice: (message: string | null) => void;
}) {
  const [open, setOpen] = useState<Plan | "new" | null>(null);
  const company = useCompany();
  const config = useInspectionConfig(company.id);
  const cleaningsByPlan = usePlanCleanings(company.id);
  const names = new Map(techs.map((t) => [t.id, t.name]));
  const done = (message: string) => {
    setOpen(null);
    onNotice(message);
  };
  return (
    <>
      <Section
        title="Maintenance"
        footer={plans.length === 0 && !canEdit ? "No regular cleaning for this pool." : undefined}
      >
        <Group>
          {plans.map((plan) => {
            const shape = { ...plan, monthly: plan.monthly ?? false };
            const next = upcomingVisitDates(shape, today, 3);
            const detail = [
              plan.assigned_user_id
                ? (names.get(plan.assigned_user_id) ?? "Teammate")
                : "No tech yet",
              plan.paused
                ? "Paused"
                : next.length
                  ? `Next ${next.map((d) => formatDay(d)).join(", ")}`
                  : "No more visits",
              plan.ends_on ? `Ends ${formatDay(plan.ends_on)}` : null,
              `${doneCounts[plan.id] ?? 0} done`,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <ListRow
                key={plan.id}
                onPress={
                  canEdit
                    ? () => {
                        onNotice(null);
                        setOpen(plan);
                      }
                    : undefined
                }
                accessibilityHint={
                  canEdit ? "Opens the plan to change, pause, or end it." : undefined
                }
              >
                <T variant="bodyEmphasis">{planSummary(shape)}</T>
                <T variant="secondary" muted>
                  {detail}
                </T>
                {(cleaningsByPlan.get(plan.id) ?? []).map((c) => {
                  const { name, kind } = cleaningType(
                    config.componentTypeById.get(c.component_type_id),
                  );
                  const due = cleaningCountdown(c.next_due, today);
                  const age = kind === "filter_replace" ? filterAge(c.last_done_on, today) : null;
                  return (
                    <View key={c.id} style={styles.cleaning}>
                      <View style={styles.cleaningIcon}>
                        <CleaningIcon kind={kind} size={16} tone={color.textMuted} />
                      </View>
                      <Text
                        style={[type.secondary, styles.cleaningText, { color: color.textMuted }]}
                        maxFontSizeMultiplier={MAX_TEXT_SCALE}
                      >
                        {cleaningSummary(name, c)} ·{" "}
                        <Text style={due.soon ? [face.semiBold, { color: color.warning }] : null}>
                          {due.label}
                        </Text>
                        {due.days > 0 ? ` (${formatDay(c.next_due)})` : ""}
                        {age ? ` · ${age}` : ""}
                      </Text>
                    </View>
                  );
                })}
                {plan.notes ? (
                  <T variant="secondary" muted>
                    {plan.notes}
                  </T>
                ) : null}
              </ListRow>
            );
          })}
          {canEdit ? (
            <ListRow
              title="Add Maintenance Plan"
              tone="link"
              onPress={() => {
                onNotice(null);
                setOpen("new");
              }}
            />
          ) : plans.length === 0 ? (
            <ListRow>
              <T muted>No regular cleaning</T>
            </ListRow>
          ) : null}
        </Group>
      </Section>

      <ModalSheet
        visible={open != null}
        onClose={() => setOpen(null)}
        title={open === "new" ? "Add Maintenance Plan" : "Maintenance Plan"}
      >
        {open ? (
          <PlanSheet
            key={open === "new" ? "new" : open.id}
            plan={open === "new" ? null : open}
            customerId={customerId}
            propertyId={propertyId}
            techs={techs}
            today={today}
            onDone={done}
          />
        ) : null}
      </ModalSheet>
    </>
  );
}

function PlanSheet({
  plan,
  customerId,
  propertyId,
  techs,
  today,
  onDone,
}: {
  plan: Plan | null;
  customerId: string;
  propertyId: string;
  techs: { id: string; name: string }[];
  today: string;
  onDone: (message: string) => void;
}) {
  const company = useCompany();
  const visitMinutes = maintenanceSettings(company.settings).visitMinutes;
  const [repeat, setRepeat] = useState<Repeat>(
    plan ? planRepeat({ ...plan, monthly: plan.monthly ?? false }) : "weekly",
  );
  const [days, setDays] = useState<number[]>(plan?.weekdays ?? []);
  const [f, setF] = useState({
    startsOn: plan?.starts_on ?? today,
    tech: plan?.assigned_user_id ?? "",
    time: plan?.visit_time?.slice(0, 5) ?? "",
    minutes: String(plan?.duration_minutes ?? visitMinutes),
    price: plan?.price_cents != null ? (plan.price_cents / 100).toFixed(2) : "",
    endsOn: plan?.ends_on ?? "",
    notes: plan?.notes ?? "",
  });
  // Unsaved entries ask before closing (owner, 2026-10-20: "Discard changes?" everywhere).
  const [startF] = useState(f);
  useUnsavedChanges(formChanged(startF, f));
  const [errors, setErrors] = useState<PlanErrors>({});
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  function save() {
    const checked = checkPlan({ repeat, days, ...f });
    setErrors(checked.errors ?? {});
    if (!checked.values) return;
    const { sync } = getServices();
    const values = checked.values as Record<string, JsonValue>;
    if (plan) sync.write("service_plan", plan.id, company.id, values);
    else
      sync.insert("service_plan", company.id, {
        customer_id: customerId,
        property_id: propertyId,
        paused: false,
        ...values,
      });
    haptics.success();
    onDone(
      plan ? "Plan saved. Upcoming visits updated." : "Plan added. Visits are on the schedule.",
    );
  }

  function setPaused(paused: boolean) {
    getServices().sync.write("service_plan", plan!.id, company.id, { paused });
    haptics.success();
    onDone(paused ? "Paused. Upcoming visits are off the schedule." : "Resumed.");
  }

  function end() {
    confirmDestructive({
      title: "End this plan?",
      message: "Its upcoming visits leave the schedule; finished visits are kept.",
      confirm: "End Plan",
      onConfirm: () => {
        getServices().sync.write("service_plan", plan!.id, company.id, {
          deleted_at: new Date().toISOString(),
        });
        haptics.success();
        onDone("Plan ended.");
      },
    });
  }

  return (
    <View style={{ gap: space["4"] }}>
      {plan ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space["2"] }}>
          <Button
            title={plan.paused ? "Resume" : "Pause"}
            kind="secondary"
            onPress={() => setPaused(!plan.paused)}
          />
          <Button title="End Plan" kind="danger" onPress={end} />
        </View>
      ) : null}
      <PlanRepeat
        value={repeat}
        onChange={setRepeat}
        days={days}
        onDaysChange={setDays}
        error={errors.weekdays}
      />
      <DateField
        label="First visit"
        value={f.startsOn}
        onChange={set("startsOn")}
        today={today}
        hint={firstVisitHint(repeat)}
        error={errors.startsOn}
      />
      <Select
        label="Tech"
        value={f.tech}
        onChange={set("tech")}
        options={[
          { value: "", label: "Nobody yet" },
          ...techs.map((t) => ({ value: t.id, label: t.name })),
        ]}
      />
      <TimeField
        label="Time (optional)"
        value={f.time}
        onChange={set("time")}
        placeholder="Any time"
        hint="Leave blank and route planning picks it."
        clearLabel="Any Time"
        error={errors.time}
      />
      <Field
        label="Visit length (minutes)"
        value={f.minutes}
        onChangeText={set("minutes")}
        keyboardType="number-pad"
        error={errors.minutes}
      />
      <Field
        label="Price per month ($)"
        value={f.price}
        onChangeText={set("price")}
        keyboardType="decimal-pad"
        hint="Billed once a month on the customer's invoice."
        error={errors.price}
      />
      <DateField
        label="Last visit (optional)"
        value={f.endsOn}
        onChange={set("endsOn")}
        today={f.startsOn || today}
        min={f.startsOn || undefined}
        placeholder="No end date"
        clearLabel="No End Date"
        error={errors.endsOn}
      />
      <Field
        label="Notes for the tech"
        value={f.notes}
        onChangeText={set("notes")}
        multiline
        hint="Gate code, dog in the yard, chemicals to bring."
      />
      <T variant="footnote" muted>
        Regular cleanings, like a filter every 3 months, are set on the website.
      </T>
      <Button title={plan ? "Save Plan" : "Add Plan"} wide onPress={save} />
    </View>
  );
}

const styles = StyleSheet.create({
  cleaning: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  cleaningIcon: { marginTop: 2 },
  cleaningText: { flex: 1 },
});
