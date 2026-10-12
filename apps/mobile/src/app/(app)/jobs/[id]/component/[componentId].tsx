import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { validateChecklistResult, type ChecklistStatus } from "@leakbook/core";
import {
  removeComponent,
  saveChecklistResult,
  useInspectionConfig,
  useJobInspection,
} from "../../../../../data/inspection";
import { useCompany, useSession } from "../../../../../state/session";
import {
  Button,
  Card,
  Choice,
  Field,
  Notice,
  Screen,
  Section,
  Segmented,
  T,
} from "../../../../../ui/components";
import { OutcomeChip } from "../../../../../features/inspection/OutcomeChip";

const OTHER = "__other__";

/** Mark one component instance inspected (with method) or excluded (with reason). */
export default function ComponentScreen() {
  const { id: jobId, componentId } = useLocalSearchParams<{ id: string; componentId: string }>();
  const company = useCompany();
  const { services, user } = useSession();
  const config = useInspectionConfig(company.id);
  const insp = useJobInspection(company.id, jobId);
  const component = insp.componentById.get(componentId);
  const result = insp.resultByComponent.get(componentId);
  const type = component ? config.componentTypeById.get(component.component_type_id) : undefined;

  const [status, setStatus] = useState<ChecklistStatus>(result?.status ?? "pending");
  const [method, setMethod] = useState(result?.method ?? "");
  const presetReasons = config.exclusionReasons.map((r) => r.label);
  const savedReason = result?.exclusion_reason ?? "";
  const [reasonChoice, setReasonChoice] = useState(
    savedReason && !presetReasons.includes(savedReason) ? OTHER : savedReason,
  );
  const [otherReason, setOtherReason] = useState(
    savedReason && !presetReasons.includes(savedReason) ? savedReason : "",
  );
  const [notes, setNotes] = useState(result?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  if (!component || !type) {
    return (
      <Screen>
        <Notice tone="warning">This component isn’t on this phone.</Notice>
      </Screen>
    );
  }
  const comp = component;
  const tests = insp.tests.filter((t) => t.job_component_id === componentId);
  const findings = insp.findings.filter((f) => f.job_component_id === componentId);
  const reason = reasonChoice === OTHER ? otherReason : reasonChoice;

  function save() {
    const values = {
      status,
      method: status === "inspected" ? method : null,
      exclusion_reason: status === "excluded" ? reason.trim() : null,
      notes: notes.trim() || null,
      inspected_at: status === "pending" ? null : new Date().toISOString(),
      inspected_by: status === "pending" ? null : (user?.id ?? null),
    };
    const problem = validateChecklistResult(values);
    if (problem) return setError(problem);
    saveChecklistResult(services.sync, company.id, jobId, componentId, result, values);
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
        label="Status"
        options={[
          { value: "inspected", label: "Inspected" },
          { value: "excluded", label: "Excluded" },
          { value: "pending", label: "To Do" },
        ]}
        value={status}
        onChange={(v) => {
          setStatus(v);
          setError(null);
        }}
      />

      {status === "inspected" ? (
        <Choice
          label="How"
          options={type.methods.map((m) => ({ value: m, label: m }))}
          value={method || null}
          onChange={setMethod}
        />
      ) : null}

      {status === "excluded" ? (
        <>
          <Choice
            label="Reason"
            options={[
              ...presetReasons.map((r) => ({ value: r, label: r })),
              { value: OTHER, label: "Other" },
            ]}
            value={reasonChoice || null}
            onChange={setReasonChoice}
          />
          {reasonChoice === OTHER ? (
            <Field
              label="Reason"
              value={otherReason}
              onChangeText={setOtherReason}
              placeholder="Why it wasn’t inspected"
            />
          ) : null}
          <T variant="muted">Excluded items are listed on the report with this reason.</T>
        </>
      ) : null}

      <Field
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="What you saw"
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button title="Save" onPress={save} />

      <Section title="Tests on this component">
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

      <Section title="Findings on this component">
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
