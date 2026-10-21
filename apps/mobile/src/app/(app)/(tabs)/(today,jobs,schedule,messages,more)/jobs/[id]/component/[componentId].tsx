import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import {
  saveChecklistResult,
  saveWhere,
  useInspectionConfig,
  useJobInspection,
} from "../../../../../../../data/inspection";
import { useCompany, useSession } from "../../../../../../../state/session";
import { MediaSection } from "../../../../../../../features/media/MediaSection";
import {
  Button,
  Field,
  Group,
  ListRow,
  Notice,
  Screen,
  T,
} from "../../../../../../../ui/components";
import { checklistOrder } from "../../../../../../../features/inspection/ChecklistTab";
import { OutcomeChip } from "../../../../../../../features/inspection/OutcomeChip";
import {
  confirmDeleteFinding,
  confirmDeleteTest,
  confirmRemoveComponent,
} from "../../../../../../../features/inspection/remove";
import { haptics } from "../../../../../../../ui/haptics";
import { useRowMenu } from "../../../../../../../ui/RowMenu";
import { Select } from "../../../../../../../ui/Select";
import {
  currentVerdict,
  verdictOptions,
  verdictValues,
  type Verdict,
} from "../../../../../../../features/inspection/verdict";
import { space } from "../../../../../../../ui/theme";
import { useAutosaveText } from "../../../../../../../ui/useAutosave";

const TO_DO = "todo";

/**
 * A checklist item (apps only, spec 5.4): what the website's checklist row has no room for on
 * a phone. Its result and where, the method, the reason it was skipped, notes, photos and voice
 * notes, and the tests and findings on it. Each change saves at once, offline; Where and notes
 * save 1 second after typing stops (owner, 2026-10-20). Previous Item and Next Item in a bar at
 * the bottom walk the checklist in its order.
 */
export default function ComponentScreen() {
  const { id: jobId, componentId } = useLocalSearchParams<{ id: string; componentId: string }>();
  const company = useCompany();
  const { services, user } = useSession();
  const config = useInspectionConfig(company.id);
  const insp = useJobInspection(company.id, jobId);
  // Touch and hold a test or finding for Edit and Delete (gestures spec section 12).
  const menu = useRowMenu();
  const component = insp.componentById.get(componentId);
  const result = insp.resultByComponent.get(componentId);
  const type = component ? config.componentTypeById.get(component.component_type_id) : undefined;
  const save = (values: Parameters<typeof saveChecklistResult>[5]) =>
    saveChecklistResult(services.sync, company.id, jobId, componentId, result, values);
  const where = useAutosaveText(result?.location_text ?? "", (v) =>
    saveWhere(services.sync, company.id, jobId, componentId, v.trim() || null),
  );
  const notes = useAutosaveText(result?.notes ?? "", (v) => save({ notes: v.trim() || null }));
  // The checklist's order, for Previous Item and Next Item.
  const order = checklistOrder(insp.components, (c) =>
    config.componentTypeById.get(c.component_type_id),
  );
  const at = order.findIndex((c) => c.id === componentId);
  const before = at > 0 ? order[at - 1] : undefined;
  const after = at >= 0 ? order[at + 1] : undefined;

  if (!component || !type) {
    return (
      <Screen title="Item">
        <Notice tone="warning">This item isn’t on this phone.</Notice>
      </Screen>
    );
  }
  const comp = component;
  const verdict = currentVerdict(result);
  const tests = insp.tests.filter((t) => t.job_component_id === componentId);
  const findings = insp.findings.filter((f) => f.job_component_id === componentId);
  const needsWhere = type.answer !== "yes_no" && (verdict === "leaking" || verdict === "attention");
  function choose(v: Verdict | null) {
    haptics.selection();
    save({
      ...verdictValues(v, user?.id ?? null),
      ...(v === null || v === "ok" || v === "na" ? { location_text: null } : {}),
      ...(v === "na" ? {} : { exclusion_reason: null }),
    });
  }

  return (
    <Screen
      title={comp.label}
      footer={
        <View style={styles.steps}>
          <Button
            title="Previous Item"
            kind="secondary"
            wide
            disabled={!before}
            style={styles.step}
            onPress={() => before && router.replace(`/jobs/${jobId}/component/${before.id}`)}
          />
          <Button
            title="Next Item"
            kind="secondary"
            wide
            disabled={!after}
            style={styles.step}
            onPress={() => after && router.replace(`/jobs/${jobId}/component/${after.id}`)}
          />
        </View>
      }
    >
      <View style={styles.form}>
        <Select
          label="Result"
          options={[
            { value: TO_DO, label: "To Do" },
            ...verdictOptions(type).map((o) => ({ value: o.value as string, label: o.label })),
          ]}
          value={verdict ?? TO_DO}
          onChange={(v) => choose(v === TO_DO ? null : (v as Verdict))}
        />
        {needsWhere ? (
          <Field
            label="Where"
            value={where.value}
            onChangeText={where.onChangeText}
            onBlur={where.onBlur}
            placeholder="Where? Under the deck, at the throat…"
            hint={where.justSaved ? "Saved" : undefined}
          />
        ) : null}
        {verdict === "na" && config.exclusionReasons.length ? (
          <Select
            label="Why it was skipped (optional)"
            options={[
              { value: "", label: "No reason given" },
              ...config.exclusionReasons.map((r) => ({ value: r.label, label: r.label })),
            ]}
            value={result?.exclusion_reason ?? ""}
            onChange={(v) => save({ exclusion_reason: v || null })}
          />
        ) : null}
        {type.methods.length ? (
          <Select
            label="Method (optional)"
            options={[
              { value: "", label: "Not recorded" },
              ...type.methods.map((m) => ({ value: m, label: m })),
            ]}
            value={result?.method ?? ""}
            onChange={(v) => save({ method: v || null })}
          />
        ) : null}
        <Field
          label="Notes (optional)"
          value={notes.value}
          onChangeText={notes.onChangeText}
          onBlur={notes.onBlur}
          multiline
          placeholder="What you saw"
          hint={notes.justSaved ? "Saved" : undefined}
        />
      </View>

      <MediaSection title="Photos and Recordings" target={{ jobId, componentId }} />

      {type.answer === "done" ? null : (
        <View style={styles.part}>
          {menu.element}
          <T variant="sectionLabel">Tests on this item</T>
          {tests.length > 0 ? (
            <Group>
              {tests.map((t) => {
                const name = config.testTypeById.get(t.test_type_id)?.name ?? "Test";
                return (
                  <ListRow
                    key={t.id}
                    title={name}
                    trailing={<OutcomeChip outcome={t.outcome} />}
                    onPress={() => router.push(`/jobs/${jobId}/test/${t.id}`)}
                    onDelete={() => confirmDeleteTest(services.sync, company.id, t.id, name)}
                    editMenu={{ menu, title: name }}
                  />
                );
              })}
            </Group>
          ) : null}
          {config.testTypes.length ? (
            <Button
              title="Add Test"
              kind="secondary"
              onPress={() => router.push(`/jobs/${jobId}/test/new?component=${componentId}`)}
            />
          ) : null}
        </View>
      )}

      {type.answer === "done" ? null : (
        <View style={styles.part}>
          <T variant="sectionLabel">Findings on this item</T>
          {findings.length > 0 ? (
            <Group>
              {findings.map((f) => (
                <ListRow
                  key={f.id}
                  title={f.title}
                  onPress={() => router.push(`/jobs/${jobId}/finding/${f.id}`)}
                  onDelete={() => confirmDeleteFinding(services.sync, company.id, f.id, f.title)}
                  editMenu={{ menu, title: f.title }}
                />
              ))}
            </Group>
          ) : null}
          <Button
            title="Add Finding"
            kind="secondary"
            onPress={() => router.push(`/jobs/${jobId}/finding/new?component=${componentId}`)}
          />
        </View>
      )}

      <Button
        title="Remove Item"
        kind="danger"
        onPress={() =>
          confirmRemoveComponent(services.sync, company.id, comp, result, () => router.back())
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: space["4"] },
  part: { gap: space["2"] },
  steps: { flexDirection: "row", gap: space["2"] },
  step: { flex: 1 },
});
