import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  cleaningCadence,
  cleaningCountdown,
  cleaningDueSpoken,
  cleaningKind,
  cleaningShortLabel,
  filterAge,
  formatDay,
  localDate,
  type CleaningKind,
  type ComponentType,
  type Job,
  type JobComponent,
  type PlanCleaning,
} from "@leakbook/core";
import { useJobRows, useRows } from "../../data/hooks";
import { useInspectionConfig } from "../../data/inspection";
import { useCompany } from "../../state/session";
import { Group, ListRow, Section } from "../../ui/components";
import { color, face, MAX_TEXT_SCALE, space, type } from "../../ui/theme";
import { WebIcon, type WebIconName } from "../../ui/WebIcon";

// Filter and salt cell cleanings, and replacing the filter (owner, 2026-10-19), from the plan's
// cleanings (plan_cleaning, synced to phones), as the website's Today, job page, and customer
// page show them.

const ICONS: Record<CleaningKind, WebIconName> = {
  filter: "filter",
  filter_replace: "newFilter",
  salt_cell: "saltCell",
  other: "repeat",
};

/** The website's CleaningIcon: a cartridge filter, a new filter, a salt cell, or a repeat arrow. */
export function CleaningIcon({
  kind,
  size = 20,
  tone = color.text,
}: {
  kind: CleaningKind;
  size?: number;
  tone?: string;
}) {
  return <WebIcon name={ICONS[kind]} size={size} color={tone} />;
}

/** The plans' cleanings on this phone, by plan, in checklist order. */
export function usePlanCleanings(companyId: string): Map<string, PlanCleaning[]> {
  const rows = useRows<PlanCleaning>("plan_cleaning", companyId);
  const config = useInspectionConfig(companyId);
  return useMemo(() => {
    const byPlan = new Map<string, PlanCleaning[]>();
    const order = (c: PlanCleaning) =>
      config.componentTypeById.get(c.component_type_id)?.sort_order ?? 0;
    for (const c of [...rows].sort((a, b) => order(a) - order(b))) {
      if (c.deleted_at) continue;
      byPlan.set(c.service_plan_id, [...(byPlan.get(c.service_plan_id) ?? []), c]);
    }
    return byPlan;
  }, [rows, config.componentTypeById]);
}

/** A cleaning's name and icon from its checklist item. */
export function cleaningType(type: ComponentType | undefined): {
  name: string;
  kind: CleaningKind;
} {
  return { name: type?.name ?? "Cleaning", kind: cleaningKind(type ?? {}) };
}

export interface VisitCleaning {
  id: string;
  name: string;
  kind: CleaningKind;
  /** How long until it's due, counted from the visit's day. */
  due: ReturnType<typeof cleaningCountdown>;
}

/** The visit's day: its plan date, else today at the shop. */
function visitDay(job: Job, timezone: string): string {
  return job.plan_date ?? localDate(new Date(), timezone);
}

/** The cleanings due within a week of a visit (the website's Today dueAt). */
export function useCleaningsDue(job: Job): VisitCleaning[] {
  const company = useCompany();
  const config = useInspectionConfig(job.company_id);
  const byPlan = usePlanCleanings(job.company_id);
  const day = visitDay(job, company.timezone);
  return useMemo(
    () =>
      (job.service_plan_id ? (byPlan.get(job.service_plan_id) ?? []) : [])
        .map((c) => ({
          id: c.id,
          ...cleaningType(config.componentTypeById.get(c.component_type_id)),
          due: cleaningCountdown(c.next_due, day),
        }))
        .filter((c) => c.due.soon),
    [byPlan, config.componentTypeById, job.service_plan_id, day],
  );
}

/**
 * The visit's Checklist: "Regular cleanings", each of the plan's cleanings with its icon, its
 * cadence and next date (or "On this visit's checklist"), the filter's age for Replace filter,
 * and how long until it's due, called out from a week before, as the website's job page.
 */
export function VisitCleanings({ job }: { job: Job }) {
  const company = useCompany();
  const config = useInspectionConfig(job.company_id);
  const byPlan = usePlanCleanings(job.company_id);
  const components = useJobRows<JobComponent & { deleted_at?: string | null }>(
    "job_component",
    job.company_id,
    job.id,
  );
  const cleanings = job.service_plan_id ? (byPlan.get(job.service_plan_id) ?? []) : [];
  if (cleanings.length === 0) return null;
  const day = visitDay(job, company.timezone);
  const onVisit = new Set(
    components
      .filter((c) => c.job_id === job.id && !c.deleted_at)
      .map((c) => c.plan_cleaning_id)
      .filter(Boolean),
  );
  return (
    <Section title="Regular cleanings">
      <Group separatorInset={space["4"] + 24 + space["3"]}>
        {cleanings.map((c) => {
          const { name, kind } = cleaningType(config.componentTypeById.get(c.component_type_id));
          const due = cleaningCountdown(c.next_due, day);
          const here = onVisit.has(c.id);
          const detail = [
            here
              ? "On this visit’s checklist"
              : `${cleaningCadence(c.every_months)} · next ${formatDay(c.next_due)}`,
            // Replace filter: how old the filter in the pool is (owner, 2026-10-19).
            kind === "filter_replace" ? filterAge(c.last_done_on, day) : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <ListRow
              key={c.id}
              leading={<CleaningIcon kind={kind} size={24} />}
              title={name}
              subtitle={detail}
              detail={
                <Text
                  style={[
                    type.body,
                    due.soon
                      ? [face.semiBold, { color: color.warning }]
                      : { color: color.textMuted },
                  ]}
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                >
                  {here ? "Today" : due.label}
                </Text>
              }
            />
          );
        })}
      </Group>
    </Section>
  );
}

export function CleaningsDue({ job }: { job: Job }) {
  const cleanings = useCleaningsDue(job);
  if (cleanings.length === 0) return null;
  // Just the icon and how soon (owner, 2026-10-19: "Don't make it too wordy"); read aloud
  // with the cleaning's name.
  return (
    <View style={styles.due} accessibilityLabel="Cleanings due">
      {cleanings.map((c) => {
        const tone = c.due.days < 0 ? color.fail : color.textMuted;
        return (
          <View
            key={c.id}
            accessible
            accessibilityLabel={cleaningDueSpoken(c.name, c.due)}
            style={styles.dueItem}
          >
            <CleaningIcon kind={c.kind} size={18} tone={tone} />
            <Text
              style={[type.secondary, face.medium, { color: tone }]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {cleaningShortLabel(c.due)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  due: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: space["4"],
    rowGap: space["1"],
    marginTop: space["1"],
  },
  dueItem: { flexDirection: "row", alignItems: "center", gap: 6 },
});
