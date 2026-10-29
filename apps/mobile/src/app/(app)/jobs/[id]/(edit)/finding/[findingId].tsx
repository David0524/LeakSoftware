import { router, Stack, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import {
  FINDING_STATUS_LABELS,
  validateFinding,
  type DiagramShape,
  type FindingStatus,
  type Job,
  type Property,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useRow } from "../../../../../../data/hooks";
import { useInspectionConfig, useJobInspection } from "../../../../../../data/inspection";
import { useCompany, useSession } from "../../../../../../state/session";
import { MediaSection } from "../../../../../../features/media/MediaSection";
import {
  Button,
  Field,
  HeaderButton,
  Notice,
  Screen,
  Segmented,
  T,
  Toggle,
} from "../../../../../../ui/components";
import { deleteFinding } from "../../../../../../features/inspection/remove";
import { haptics } from "../../../../../../ui/haptics";
import { PoolDiagram } from "../../../../../../ui/PoolDiagram";
import { Select } from "../../../../../../ui/Select";
import { ShapePicker } from "../../../../../../ui/ShapePicker";
import { useDiscardChanges } from "../../../../../../ui/discard";
import { DraftNote } from "../../../../../../ui/DraftNote";
import { useDraft } from "../../../../../../ui/useDraft";
import { useSheetLock } from "../../../../../../ui/sheet";
import { color, space } from "../../../../../../ui/theme";

const STATUSES = Object.keys(FINDING_STATUS_LABELS) as FindingStatus[];

/**
 * Add Finding / Edit Finding (spec 6.2): what, severity, item, where, status, the pool's
 * shape and spa (saved at once), the pin on the diagram, notes, photos; editing ends with
 * Delete Finding. Add Finding or Save Finding sits in a bar pinned at the bottom, above the
 * keyboard (owner, 2026-10-20: one-handed use, item 3). Add Photo on a new finding saves it
 * first. Cancel, and Android's back button, ask first when anything changed.
 */
export default function FindingScreen() {
  const params = useLocalSearchParams<{ id: string; findingId: string; component?: string }>();
  const jobId = params.id;
  const company = useCompany();
  const { services } = useSession();
  const config = useInspectionConfig(company.id);
  const insp = useJobInspection(company.id, jobId);
  const job = useRow<Job>("job", jobId);
  const property = useRow<Property>("property", job?.property_id);
  // The shape tiles show only while the pool has no shape (owner, 2026-10-29); once shown, they
  // stay for the rest of this edit. Decided when the pool first loads.
  const [asksShape, setAsksShape] = useState<boolean | null>(null);
  if (asksShape === null && property) setAsksShape(!property.diagram_shape);
  // Add Photo on a new finding saves it first; the sheet then edits that finding.
  const [savedId, setSavedId] = useState<string | null>(null);
  // The id of a finding this screen just made, kept synchronously: a second tap before the screen
  // has drawn saves it again instead of adding a second one.
  const madeId = useRef<string | null>(null);
  const findingId = params.findingId === "new" ? savedId : params.findingId;
  const existing = findingId ? insp.findings.find((f) => f.id === findingId) : undefined;
  const whereRef = useRef<TextInput>(null);

  const [title, setTitle] = useState(existing?.title ?? "");
  const [componentId, setComponentId] = useState<string>(
    existing?.job_component_id ?? params.component ?? "",
  );
  const [severity, setSeverity] = useState(existing?.severity_key ?? "");
  const [location, setLocation] = useState(existing?.location_text ?? "");
  const [pin, setPin] = useState<{ x: number; y: number } | null>(
    existing?.pin_x != null && existing?.pin_y != null
      ? { x: Number(existing.pin_x), y: Number(existing.pin_y) }
      : null,
  );
  const [status, setStatus] = useState<FindingStatus>(existing?.status ?? "open");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Anything changed since the sheet opened? Then Cancel asks first, and a swipe down doesn't
  // close the sheet by accident. The pool's shape and spa save at once, so they don't count.
  const snapshot = () =>
    JSON.stringify({ title, componentId, severity, location, pin, status, notes });
  const [initial, setInitial] = useState(snapshot);
  const dirty = snapshot() !== initial;
  useSheetLock(dirty);
  // Typed text is kept as a draft until it's saved or discarded (owner, 2026-10-27).
  const draft = useDraft({
    form: "finding",
    id: params.findingId === "new" ? `new-${jobId}` : params.findingId,
    fields: { title, location, notes },
    restore: (c) => {
      if (c.title !== undefined) setTitle(c.title);
      if (c.location !== undefined) setLocation(c.location);
      if (c.notes !== undefined) setNotes(c.notes);
    },
  });
  // Every way out asks first while there are changes (owner, 2026-10-20).
  const leave = useDiscardChanges(dirty, draft.clear);

  function cancel() {
    router.back();
  }

  const bar = (
    <Stack.Screen
      options={{
        title: existing || savedId ? "Edit Finding" : "Add Finding",
        headerBackVisible: false,
        headerLeft: () => <HeaderButton title="Cancel" onPress={cancel} />,
        headerRight: undefined,
      }}
    />
  );

  if (params.findingId !== "new" && !existing) {
    return (
      <Screen>
        {bar}
        <Notice tone="warning">This finding isn’t on this phone.</Notice>
      </Screen>
    );
  }

  /**
   * Save with the checks; `stay` keeps the sheet open (Add Photo on a new finding). Returns
   * the finding's id, or null when the checks failed (the errors show).
   */
  function save(stay = false): string | null {
    const e = validateFinding({ title, severity_key: severity });
    setErrors(e);
    if (Object.keys(e).length > 0) return null;
    const values: Record<string, JsonValue> = {
      title: title.trim(),
      job_component_id: componentId || null,
      severity_key: severity,
      location_text: location.trim() || null,
      pin_x: pin?.x ?? null,
      pin_y: pin?.y ?? null,
      status,
      notes: notes.trim() || null,
    };
    let id = existing?.id ?? savedId ?? madeId.current;
    if (id) services.sync.write("finding", id, company.id, values);
    else {
      id = services.sync.insert("finding", company.id, { ...values, job_id: jobId });
      madeId.current = id;
    }
    haptics.success();
    if (stay) {
      setSavedId(id);
      setInitial(snapshot());
      draft.clear();
    } else {
      draft.clear();
      leave(() => router.back());
    }
    return id;
  }

  const shape = (property?.diagram_shape as DiagramShape | null | undefined) ?? null;
  const setPool = (values: Record<string, JsonValue>) => {
    if (property) services.sync.write("property", property.id, property.company_id, values);
  };
  const sevColor = config.severityByKey.get(severity)?.color ?? color.fail;

  return (
    <Screen
      // iPhone: Previous, Next and Done over the keyboard.
      keyboardBar
      footer={
        <Button
          title={existing || savedId ? "Save Finding" : "Add Finding"}
          wide
          onPress={() => save()}
        />
      }
    >
      {bar}
      <View style={styles.form}>
        <DraftNote draft={draft} />
        <Field
          label="What"
          value={title}
          onChangeText={setTitle}
          error={errors.title}
          placeholder="Crack at the skimmer throat"
          autoCapitalize="sentences"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => whereRef.current?.focus()}
        />
        <Select
          label="Severity"
          options={[
            { value: "", label: "Choose…" },
            ...config.severities.map((s) => ({ value: s.key, label: s.name })),
          ]}
          value={severity}
          onChange={setSeverity}
          error={errors.severity_key}
        />
        <Select
          label="Item (optional)"
          options={[
            { value: "", label: "None" },
            ...insp.components.map((c) => ({ value: c.id, label: c.label })),
          ]}
          value={componentId}
          onChange={setComponentId}
        />
        <Field
          ref={whereRef}
          label="Where (optional)"
          returnKeyType="done"
          value={location}
          onChangeText={setLocation}
          placeholder="Two feet left of the skimmer"
        />
        <Segmented
          label="Status"
          fill={false}
          options={STATUSES.map((s) => ({ value: s, label: FINDING_STATUS_LABELS[s] }))}
          value={status}
          onChange={setStatus}
        />
        {property && asksShape ? (
          <View style={{ gap: space["2"] }}>
            <ShapePicker
              value={shape}
              hint={shape ? undefined : "Pick one so the diagram matches the pool."}
              onChange={(next) => setPool({ diagram_shape: next })}
            />
            <Toggle
              label="Has a spa"
              value={property.has_spa}
              onChange={(v) => setPool({ has_spa: v })}
            />
          </View>
        ) : null}
        {property ? (
          <View style={{ gap: space["2"] }}>
            <View>
              <T variant="bodyMedium">Pin on the diagram (optional)</T>
              <T variant="secondary" muted>
                Tap where the leak is.
              </T>
            </View>
            <PoolDiagram
              shape={shape}
              hasSpa={property.has_spa}
              layout={property.diagram_layout}
              outlined
              onPlace={(x, y) => setPin({ x, y })}
              pins={pin ? [{ id: "this", x: pin.x, y: pin.y, color: sevColor, label: "" }] : []}
            />
            <View style={styles.pinRow} accessibilityLiveRegion="polite">
              <T variant="secondary">{pin ? "Pin placed." : "No pin yet."}</T>
              {pin ? <Button title="Clear Pin" kind="quiet" onPress={() => setPin(null)} /> : null}
            </View>
          </View>
        ) : null}
        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
        {/* Shown from the start: Add Photo saves a new finding first (owner, 2026-10-20). */}
        <MediaSection
          title="Photos"
          target={{ jobId, findingId: findingId ?? undefined }}
          unsaved={!findingId}
          beforeCapture={() => {
            const id = existing ? existing.id : save(true);
            return id ? { jobId, findingId: id } : null;
          }}
        />
        {Object.keys(errors).length > 0 ? (
          <Notice tone="error">Fix the highlighted fields.</Notice>
        ) : null}
        {existing ? (
          <View style={[styles.delete, { borderTopColor: color.separator }]}>
            <Button
              title="Delete Finding"
              kind="danger"
              wide
              onPress={() =>
                deleteFinding(services.sync, company.id, existing.id, () =>
                  leave(() => router.back()),
                )
              }
            />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: space["4"] },
  pinRow: { flexDirection: "row", alignItems: "center", gap: space["3"], minHeight: 44 },
  delete: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space["4"],
    marginTop: space["2"],
  },
});
