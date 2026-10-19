import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  cleaningCountdown,
  cleaningDueSpoken,
  cleaningKind,
  cleaningShortLabel,
  localDate,
  type CleaningKind,
  type Job,
  type JobComponent,
} from "@leakbook/core";
import { useJobRows } from "../../data/hooks";
import { useInspectionConfig } from "../../data/inspection";
import { useCompany } from "../../state/session";
import { Group, ListRow, Section } from "../../ui/components";
import { color, face, MAX_TEXT_SCALE, space, type } from "../../ui/theme";
import { WebIcon, type WebIconName } from "../../ui/WebIcon";

// Filter and salt cell cleanings (owner, 2026-10-19). Phones don't sync plan_cleaning yet, so
// these come from what is on the phone: the visit's own checklist items made from a plan's
// cleaning (job_component.plan_cleaning_id). A cleaning on a visit's checklist is due that day.

const ICONS: Record<CleaningKind, WebIconName> = {
  filter: "filter",
  salt_cell: "saltCell",
  other: "repeat",
};

/** The website's CleaningIcon: a cartridge filter, a salt cell, or a repeat arrow. */
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

export interface VisitCleaning {
  id: string;
  /** The checklist item's type, for its name and kind. */
  typeId: string;
  name: string;
  kind: CleaningKind;
  /** "Due today": the visit's own day, as the website counts from the plan's next date. */
  due: ReturnType<typeof cleaningCountdown>;
}

/** The cleanings on a visit's checklist, in checklist order. */
export function useVisitCleanings(job: Job): VisitCleaning[] {
  const company = useCompany();
  const components = useJobRows<JobComponent & { deleted_at?: string | null }>(
    "job_component",
    job.company_id,
    job.id,
  );
  const day = job.plan_date ?? localDate(new Date(), company.timezone);
  return useMemo(
    () =>
      components
        .filter((c) => c.job_id === job.id && c.plan_cleaning_id && !c.deleted_at)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((c) => ({
          id: c.id,
          typeId: c.component_type_id,
          name: c.label,
          kind: cleaningKind({ name: c.label }),
          due: cleaningCountdown(day, day),
        })),
    [components, job.id, day],
  );
}

/**
 * The visit's Checklist: "Regular cleanings", each cleaning on this visit's checklist with its
 * icon, "On this visit's checklist", and "Today", as the website's job page.
 */
export function VisitCleanings({ job }: { job: Job }) {
  const config = useInspectionConfig(job.company_id);
  const cleanings = useVisitCleanings(job);
  if (cleanings.length === 0) return null;
  return (
    <Section title="Regular cleanings">
      <Group separatorInset={space["4"] + 24 + space["3"]}>
        {cleanings.map((c) => {
          const item = config.componentTypeById.get(c.typeId);
          return (
            <ListRow
              key={c.id}
              leading={<CleaningIcon kind={item ? cleaningKind(item) : c.kind} size={24} />}
              subtitle="On this visit’s checklist"
              detail={
                <Text
                  style={[
                    type.body,
                    c.due.soon && [face.semiBold, { color: color.warning }],
                    !c.due.soon && { color: color.textMuted },
                  ]}
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                >
                  Today
                </Text>
              }
              title={item?.name ?? c.name}
            />
          );
        })}
      </Group>
    </Section>
  );
}

/** Today's stop: "Clean filter: due today" pills, as the website's Today. */
export function CleaningsDue({ job }: { job: Job }) {
  const cleanings = useVisitCleanings(job);
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
