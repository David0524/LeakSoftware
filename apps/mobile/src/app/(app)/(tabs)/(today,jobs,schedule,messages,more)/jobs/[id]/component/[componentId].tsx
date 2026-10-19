import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  saveChecklistResult,
  useInspectionConfig,
  useJobInspection,
} from "../../../../../data/inspection";
import { useCompany, useSession } from "../../../../../state/session";
import { MediaSection } from "../../../../../features/media/MediaSection";
import {
  Button,
  Field,
  Group,
  ListRow,
  Notice,
  Screen,
  Section,
  Segmented,
} from "../../../../../ui/components";
import { OutcomeChip } from "../../../../../features/inspection/OutcomeChip";
import {
  confirmDeleteFinding,
  confirmDeleteTest,
  confirmRemoveComponent,
} from "../../../../../features/inspection/remove";
import { haptics } from "../../../../../ui/haptics";
import {
  currentVerdict,
  verdictOptions,
  verdictValues,
  type Verdict,
} from "../../../../../features/inspection/verdict";
import { space } from "../../../../../ui/theme";

/** One checklist item: its verdict and where, notes, photos, tests, and findings. */
export default function ComponentScreen() {
  const { id: jobId, componentId } = useLocalSearchParams<{ id: string; componentId: string }>();
  const company = useCompany();
  const { services, user } = useSession();
  const config = useInspectionConfig(company.id);
  const insp = useJobInspection(company.id, jobId);
  const component = insp.componentById.get(componentId);
  const result = insp.resultByComponent.get(componentId);
  const type = component ? config.componentTypeById.get(component.component_type_id) : undefined;

  const [verdict, setVerdict] = useState<Verdict | null>(currentVerdict(result));
  const [where, setWhere] = useState(result?.location_text ?? "");
  const [notes, setNotes] = useState(result?.notes ?? "");

  if (!component || !type) {
    return (
      <Screen>
        <Notice tone="warning">This item isn’t on this phone.</Notice>
      </Screen>
    );
  }
  const comp = component;
  const tests = insp.tests.filter((t) => t.job_component_id === componentId);
  const findings = insp.findings.filter((f) => f.job_component_id === componentId);
  const needsWhere = type.answer !== "yes_no" && (verdict === "leaking" || verdict === "attention");

  function save() {
    saveChecklistResult(services.sync, company.id, jobId, componentId, result, {
      ...verdictValues(verdict, user?.id ?? null),
      location_text: needsWhere ? where.trim() || null : null,
      notes: notes.trim() || null,
    });
    haptics.success();
    router.back();
  }

  function remove() {
    confirmRemoveComponent(services.sync, company.id, comp, result, () => router.back());
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: comp.label }} />
      <Segmented
        label="Result"
        options={verdictOptions(type)}
        value={verdict}
        onChange={setVerdict}
      />
      {needsWhere ? (
        <Field
          label="Where"
          value={where}
          onChangeText={setWhere}
          placeholder="Where on the line or fitting"
        />
      ) : null}

      <Field
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="What you saw"
      />
      <Button title="Save" onPress={save} />

      <MediaSection target={{ jobId, componentId }} />

      <Section title="Tests on this item">
        {tests.length > 0 ? (
          <Group>
            {tests.map((t) => (
              <ListRow
                key={t.id}
                title={config.testTypeById.get(t.test_type_id)?.name ?? "Test"}
                trailing={<OutcomeChip outcome={t.outcome} />}
                onPress={() => router.push(`/jobs/${jobId}/test/${t.id}`)}
                onDelete={() => confirmDeleteTest(services.sync, company.id, t.id)}
              />
            ))}
          </Group>
        ) : null}
        <View style={styles.wrap}>
          {config.testTypes.map((tt) => (
            <Button
              key={tt.id}
              title={`+ ${tt.name}`}
              kind="secondary"
              onPress={() =>
                router.push(`/jobs/${jobId}/test/new?type=${tt.id}&component=${componentId}`)
              }
            />
          ))}
        </View>
      </Section>

      <Section title="Findings on this item">
        {findings.length > 0 ? (
          <Group>
            {findings.map((f) => (
              <ListRow
                key={f.id}
                title={f.title}
                onPress={() => router.push(`/jobs/${jobId}/finding/${f.id}`)}
                onDelete={() => confirmDeleteFinding(services.sync, company.id, f.id)}
              />
            ))}
          </Group>
        ) : null}
        <Button
          title="+ Finding Here"
          kind="secondary"
          onPress={() => router.push(`/jobs/${jobId}/finding/new?component=${componentId}`)}
        />
      </Section>

      <Button title={`Remove ${comp.label}`} kind="danger" onPress={remove} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space["2"] },
});
