import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import {
  removeComponent,
  saveChecklistResult,
  useInspectionConfig,
  useJobInspection,
} from "../../../../../data/inspection";
import { useCompany, useSession } from "../../../../../state/session";
import { MediaSection } from "../../../../../features/media/MediaSection";
import {
  Button,
  Card,
  Field,
  Notice,
  Screen,
  Section,
  Segmented,
  T,
} from "../../../../../ui/components";
import { OutcomeChip } from "../../../../../features/inspection/OutcomeChip";
import {
  currentVerdict,
  verdictOptions,
  verdictValues,
  type Verdict,
} from "../../../../../features/inspection/verdict";

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
    router.back();
  }

  function remove() {
    Alert.alert(`Remove ${comp.label}?`, "Use this only if it was added by mistake.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          removeComponent(services.sync, company.id, comp, result);
          router.back();
        },
      },
    ]);
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
        {tests.map((t) => (
          <Card key={t.id}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <T variant="strong">{config.testTypeById.get(t.test_type_id)?.name ?? "Test"}</T>
              <OutcomeChip outcome={t.outcome} />
            </View>
            <Button
              title="Open"
              kind="quiet"
              onPress={() => router.push(`/jobs/${jobId}/test/${t.id}`)}
            />
          </Card>
        ))}
        <View style={{ gap: 8 }}>
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
        {findings.map((f) => (
          <Card key={f.id}>
            <T variant="strong">{f.title}</T>
            <Button
              title="Open"
              kind="quiet"
              onPress={() => router.push(`/jobs/${jobId}/finding/${f.id}`)}
            />
          </Card>
        ))}
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
