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
import { Button, Card, Field, Row, Segmented, T } from "../../ui/components";
import { color, radius, space } from "../../ui/theme";
import { currentVerdict, verdictOptions, verdictValues, type Verdict } from "./verdict";

const SECTIONS: ChecklistSection[] = ["visual", "plumbing", "bond_beam", "other"];

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
            createChecklist(services.sync, job.company_id, job.id, config.componentTypes, {
              has_pool: property?.has_pool ?? true,
              has_spa: property?.has_spa ?? false,
              pool_type: property?.pool_type ?? null,
            })
          }
        />
      </Card>
    );
  }

  const typeOf = (c: JobComponent) => config.componentTypeById.get(c.component_type_id);
  const missing = config.componentTypes.filter(
    (t) =>
      !insp.components.some((c) => c.component_type_id === t.id) &&
      (!property || componentApplies(t, property)),
  );

  return (
    <View style={{ gap: space["4"] }}>
      <T variant="muted">
        {tally.pass} pass · {tally.attention} attention · {tally.leaking} leaking ·{" "}
        {tally.notApplicable} N/A · {tally.pending} to do
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
            <T variant="label">{CHECKLIST_SECTION_LABELS[section]}</T>
            {items.map((c, i) => {
              const type = typeOf(c);
              const last = items[i + 1]?.component_type_id !== c.component_type_id;
              return type ? (
                <View key={c.id} style={{ gap: space["2"] }}>
                  <ChecklistItem job={job} component={c} type={type} />
                  {last && type.allows_multiple ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Add another ${type.name.toLowerCase()}`}
                      style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}
                      onPress={() =>
                        addComponent(services.sync, job.company_id, job.id, type, insp.components)
                      }
                    >
                      <T variant="strong" style={{ color: color.link }}>
                        + Add Another {type.name}
                      </T>
                    </Pressable>
                  ) : null}
                </View>
              ) : null;
            })}
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
}: {
  job: Job;
  component: JobComponent;
  type: ComponentType;
}) {
  const { services, user } = useSession();
  const insp = useJobInspection(job.company_id, job.id);
  const result = insp.resultByComponent.get(component.id);
  const verdict = currentVerdict(result);
  const [where, setWhere] = useState<string | null>(null);
  const needsWhere = type.answer !== "yes_no" && (verdict === "leaking" || verdict === "attention");

  function choose(v: Verdict) {
    saveChecklistResult(services.sync, job.company_id, job.id, component.id, result, {
      ...verdictValues(v, user?.id ?? null),
      ...(v === "ok" || v === "na" ? { location_text: null } : {}),
    });
  }

  return (
    <View style={styles.item}>
      <Row style={{ justifyContent: "space-between" }}>
        <T variant="strong" style={{ flex: 1 }}>
          {component.label}
        </T>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${component.label}: photos, tests, and notes`}
          hitSlop={8}
          style={{ minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" }}
          onPress={() => router.push(`/jobs/${job.id}/component/${component.id}`)}
        >
          <T variant="strong" style={{ color: color.link }}>
            More
          </T>
        </Pressable>
      </Row>
      <Segmented options={verdictOptions(type)} value={verdict} onChange={choose} />
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
  );
}

const styles = StyleSheet.create({
  item: {
    gap: space["2"],
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    padding: space["3"],
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space["2"] },
});
