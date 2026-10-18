import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  CHECKLIST_SECTION_LABELS,
  checklistTally,
  componentApplies,
  type ChecklistSection,
  type ComponentType,
  type Job,
  type JobComponent,
  type Property,
} from "@leakbook/core";
import {
  addComponent,
  createChecklist,
  saveChecklistResult,
  useInspectionConfig,
  useJobInspection,
} from "../../data/inspection";
import { useSession } from "../../state/session";
import { Button, Card, Field, Group, Row, Segmented, T } from "../../ui/components";
import { Icon } from "../../ui/Icon";
import { SwipeToDelete } from "../../ui/SwipeRow";
import { color, ios, space } from "../../ui/theme";
import { confirmRemoveComponent } from "./remove";
import { currentVerdict, verdictOptions, verdictValues, type Verdict } from "./verdict";

// "service" is the pool service checklist (maintenance visits); it was missing, so service
// items didn't show on phones.
const SECTIONS: ChecklistSection[] = ["service", "visual", "plumbing", "bond_beam", "other"];

/** The checklist in the shop's sections, one verdict per item (works offline). */
export function ChecklistTab({ job, property }: { job: Job; property?: Property }) {
  const { services } = useSession();
  const config = useInspectionConfig(job.company_id);
  const insp = useJobInspection(job.company_id, job.id);
  const tally = checklistTally(insp.components, insp.results);

  if (insp.components.length === 0) {
    return (
      <Card>
        <T variant="body">No checklist yet for this job.</T>
        <Button
          title="Set Up Checklist"
          onPress={() =>
            createChecklist(
              services.sync,
              job.company_id,
              job.id,
              config.componentTypes,
              {
                has_pool: property?.has_pool ?? true,
                has_spa: property?.has_spa ?? false,
                pool_type: property?.pool_type ?? null,
              },
              job.type === "maintenance" ? "maintenance" : "detection",
            )
          }
        />
      </Card>
    );
  }

  const typeOf = (c: JobComponent) => config.componentTypeById.get(c.component_type_id);
  const missing = config.componentTypes.filter(
    (t) =>
      !insp.components.some((c) => c.component_type_id === t.id) &&
      (t.job_type ?? "detection") === (job.type === "maintenance" ? "maintenance" : "detection") &&
      (!property || componentApplies(t, property)),
  );

  return (
    <View style={{ gap: space["4"] }}>
      <T variant="muted">
        {job.type === "maintenance"
          ? `${tally.pass} done · ${tally.attention} need attention · ${tally.notApplicable} skipped · ${tally.pending} to do`
          : `${tally.pass} pass · ${tally.attention} attention · ${tally.leaking} leaking · ${tally.notApplicable} N/A · ${tally.pending} to do`}
      </T>
      {SECTIONS.map((section) => {
        const items = insp.components
          .filter((c) => (typeOf(c)?.section ?? "other") === section)
          .sort(
            (a, b) =>
              (typeOf(a)?.sort_order ?? 0) - (typeOf(b)?.sort_order ?? 0) ||
              a.sort_order - b.sort_order,
          );
        if (items.length === 0) return null;
        return (
          <View key={section} style={{ gap: space["2"] }}>
            <T variant="label" style={ios && { paddingHorizontal: space["4"] }}>
              {CHECKLIST_SECTION_LABELS[section]}
            </T>
            {/* One inset grouped block per section, a hairline between items. */}
            <Group>
              {items.map((c, i) => {
                const type = typeOf(c);
                const last = items[i + 1]?.component_type_id !== c.component_type_id;
                return type ? (
                  <ChecklistItem
                    key={c.id}
                    job={job}
                    component={c}
                    type={type}
                    // "+ Add" sits in the last item of a type that can repeat, not on its own row.
                    onAddAnother={
                      last && type.allows_multiple
                        ? () =>
                            addComponent(
                              services.sync,
                              job.company_id,
                              job.id,
                              type,
                              insp.components,
                            )
                        : undefined
                    }
                  />
                ) : null;
              })}
            </Group>
          </View>
        );
      })}
      {missing.length > 0 ? (
        <View style={{ gap: space["2"] }}>
          <T variant="label">Add an item</T>
          <View style={styles.wrap}>
            {missing.map((t) => (
              <Button
                key={t.id}
                title={`+ ${t.name}`}
                kind="secondary"
                onPress={() =>
                  addComponent(services.sync, job.company_id, job.id, t, insp.components)
                }
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ChecklistItem({
  job,
  component,
  type,
  onAddAnother,
}: {
  job: Job;
  component: JobComponent;
  type: ComponentType;
  onAddAnother?: () => void;
}) {
  const { services, user } = useSession();
  const insp = useJobInspection(job.company_id, job.id);
  const result = insp.resultByComponent.get(component.id);
  const verdict = currentVerdict(result);
  const [where, setWhere] = useState<string | null>(null);
  const needsWhere = type.answer !== "yes_no" && (verdict === "leaking" || verdict === "attention");

  // Maintenance items are just done or not: a check, no choices (owner, 2026-10-18).
  const check = type.answer === "done";
  const done = verdict === "ok";

  function choose(v: Verdict | null) {
    saveChecklistResult(services.sync, job.company_id, job.id, component.id, result, {
      ...verdictValues(v, user?.id ?? null),
      ...(v === null || v === "ok" || v === "na" ? { location_text: null } : {}),
    });
  }

  // Swipe left to remove (as on the item's own screen, under More); screen readers get the
  // same Remove as an action on the item's name.
  const remove = () => confirmRemoveComponent(services.sync, job.company_id, component, result);

  return (
    <SwipeToDelete label="Remove" onDelete={remove}>
      <View style={styles.item}>
        <Row style={{ justifyContent: "space-between", gap: space["4"] }}>
          {check ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              accessibilityLabel={component.label}
              hitSlop={10}
              onPress={() => choose(done ? null : "ok")}
              style={[styles.check, done ? styles.checkOn : null]}
            >
              {done ? (
                <Icon name="checkmark" size={16} color={color.onPrimary} weight="bold" />
              ) : null}
            </Pressable>
          ) : null}
          <View
            style={{ flex: 1 }}
            accessible
            accessibilityLabel={component.label}
            accessibilityActions={[{ name: "delete", label: "Remove" }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === "delete") remove();
            }}
          >
            <T variant="strong">{component.label}</T>
          </View>
          {onAddAnother ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add another ${type.name.toLowerCase()}`}
              hitSlop={LINK_SLOP}
              onPress={onAddAnother}
            >
              <T variant="strong" style={{ color: color.link }}>
                + Add
              </T>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${component.label}: photos, tests, and notes`}
            hitSlop={LINK_SLOP}
            onPress={() => router.push(`/jobs/${job.id}/component/${component.id}`)}
          >
            <T variant="strong" style={{ color: color.link }}>
              More
            </T>
          </Pressable>
        </Row>
        {check ? null : (
          <Segmented options={verdictOptions(type)} value={verdict} onChange={choose} />
        )}
        {needsWhere ? (
          <Field
            label="Where"
            value={where ?? result?.location_text ?? ""}
            onChangeText={setWhere}
            onBlur={() => {
              if (result && where !== null && where !== (result.location_text ?? ""))
                saveChecklistResult(services.sync, job.company_id, job.id, component.id, result, {
                  location_text: where.trim() || null,
                });
              setWhere(null);
            }}
            placeholder="Where on the line or fitting"
          />
        ) : null}
      </View>
    </SwipeToDelete>
  );
}

/** The text links are 22 pt tall; the slop makes them at least 46 pt to tap. */
const LINK_SLOP = { top: 12, bottom: 12, left: 8, right: 8 };

const styles = StyleSheet.create({
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: color.controlBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: color.pass, borderColor: color.pass },
  item: {
    gap: space["2"],
    paddingHorizontal: space["4"],
    paddingVertical: space["3"],
    // Solid, so the row covers the red Remove until it is swiped.
    backgroundColor: color.surface,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space["2"] },
});
