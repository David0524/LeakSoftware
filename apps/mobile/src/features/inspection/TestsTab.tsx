import { router } from "expo-router";
import { View } from "react-native";
import { calculate, formatSchedule, type Job } from "@leakbook/core";
import { useInspectionConfig, useJobInspection } from "../../data/inspection";
import { useCompany, useSession } from "../../state/session";
import { Group, ListRow, T } from "../../ui/components";
import { space } from "../../ui/theme";
import { OutcomeChip } from "./OutcomeChip";
import { confirmDeleteTest } from "./remove";

/**
 * Tests, as on the website (spec 5.4 Findings): a row per test with its item and time, the
 * calculated summary, the recorded fields and notes, the outcome chip; tap to edit, swipe left
 * to delete. Add Test is in the job page's Next Step bar.
 */
export function TestsTab({ job }: { job: Job }) {
  const company = useCompany();
  const { services } = useSession();
  const config = useInspectionConfig(job.company_id);
  const insp = useJobInspection(job.company_id, job.id);
  const now = new Date();

  return (
    <View style={{ gap: space["4"] }}>
      {insp.tests.length === 0 ? (
        <T muted>No tests recorded.</T>
      ) : (
        <Group>
          {insp.tests.map((t) => {
            const type = config.testTypeById.get(t.test_type_id);
            const name = type?.name ?? "Test";
            const component = t.job_component_id
              ? insp.componentById.get(t.job_component_id)
              : undefined;
            const meta = [
              component?.label,
              t.performed_at ? formatSchedule(t.performed_at, now, company.timezone) : null,
            ]
              .filter(Boolean)
              .join(" · ");
            const calc = type ? calculate(type, t.data) : null;
            const fields =
              type && !type.calculator
                ? type.field_schema.fields.filter(
                    (f) => t.data[f.key] != null && t.data[f.key] !== "",
                  )
                : [];
            return (
              <ListRow
                key={t.id}
                accessibilityLabel={`Edit ${name}`}
                onPress={() => router.push(`/jobs/${job.id}/test/${t.id}`)}
                onDelete={() => confirmDeleteTest(services.sync, job.company_id, t.id, name)}
                trailing={<OutcomeChip outcome={t.outcome} />}
              >
                <T variant="bodyEmphasis">{name}</T>
                {meta ? (
                  <T variant="secondary" muted>
                    {meta}
                  </T>
                ) : null}
                {calc?.summary ? (
                  <T variant="bodyMedium" style={{ marginTop: 4 }}>
                    {calc.summary}
                  </T>
                ) : null}
                {fields.map((f) => (
                  <T key={f.key} variant="secondary">
                    <T variant="secondary" muted>
                      {`${f.label}:`}
                    </T>{" "}
                    {String(t.data[f.key])}
                  </T>
                ))}
                {t.notes ? (
                  <T variant="secondary" style={{ marginTop: 4 }}>
                    {t.notes}
                  </T>
                ) : null}
              </ListRow>
            );
          })}
        </Group>
      )}
      {/* Add Test is in the job page's Next Step bar (owner, 2026-10-20). */}
    </View>
  );
}
