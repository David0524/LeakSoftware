import { router } from "expo-router";
import { View } from "react-native";
import { calculate, type Job } from "@leakbook/core";
import { useInspectionConfig, useJobInspection } from "../../data/inspection";
import { useSession } from "../../state/session";
import { Button, Group, ListRow, T } from "../../ui/components";
import { space } from "../../ui/theme";
import { OutcomeChip } from "./OutcomeChip";
import { confirmDeleteTest } from "./remove";

export function TestsTab({ job }: { job: Job }) {
  const { services } = useSession();
  const config = useInspectionConfig(job.company_id);
  const insp = useJobInspection(job.company_id, job.id);

  return (
    <View style={{ gap: space["3"] }}>
      {insp.tests.length === 0 ? null : (
        <Group>
          {insp.tests.map((t) => {
            const type = config.testTypeById.get(t.test_type_id);
            const component = t.job_component_id
              ? insp.componentById.get(t.job_component_id)
              : undefined;
            const where = String(t.data.line_name ?? t.data.location ?? component?.label ?? "");
            const summary = type ? calculate(type, t.data).summary : null;
            return (
              <ListRow
                key={t.id}
                onPress={() => router.push(`/jobs/${job.id}/test/${t.id}`)}
                onDelete={() => confirmDeleteTest(services.sync, job.company_id, t.id)}
                trailing={<OutcomeChip outcome={t.outcome} />}
              >
                <T variant="strong">
                  {type?.name ?? "Test"}
                  {where ? ` · ${where}` : ""}
                </T>
                {(summary ?? t.data.observation) ? (
                  <T variant="muted">{summary ?? String(t.data.observation)}</T>
                ) : null}
              </ListRow>
            );
          })}
        </Group>
      )}
      {insp.tests.length === 0 ? (
        <T variant="muted">No tests recorded yet. Pick one to add.</T>
      ) : (
        <T variant="label">Add a test</T>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space["2"] }}>
        {config.testTypes.map((tt) => (
          <Button
            key={tt.id}
            title={`+ ${tt.name}`}
            kind="secondary"
            onPress={() => router.push(`/jobs/${job.id}/test/new?type=${tt.id}`)}
          />
        ))}
      </View>
    </View>
  );
}
