import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";
import { validateFinding, type FindingStatus, type Job, type Property } from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useRow } from "../../../../../data/hooks";
import { useInspectionConfig, useJobInspection } from "../../../../../data/inspection";
import { useCompany, useSession } from "../../../../../state/session";
import { MediaSection } from "../../../../../features/media/MediaSection";
import {
  Button,
  Choice,
  Field,
  Notice,
  Screen,
  Section,
  T,
  Segmented,
} from "../../../../../ui/components";
import { PoolDiagram } from "../../../../../ui/PoolDiagram";
import { color } from "../../../../../ui/theme";

/** Record a leak: what, where, how serious, and a pin on the pool diagram. */
export default function FindingScreen() {
  const params = useLocalSearchParams<{ id: string; findingId: string; component?: string }>();
  const jobId = params.id;
  const company = useCompany();
  const { services } = useSession();
  const config = useInspectionConfig(company.id);
  const insp = useJobInspection(company.id, jobId);
  const job = useRow<Job>("job", jobId);
  const property = useRow<Property>("property", job?.property_id);
  const existing =
    params.findingId === "new" ? undefined : insp.findings.find((f) => f.id === params.findingId);

  const [title, setTitle] = useState(existing?.title ?? "");
  const [componentId, setComponentId] = useState<string | null>(
    existing?.job_component_id ?? params.component ?? null,
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

  if (params.findingId !== "new" && !existing) {
    return (
      <Screen>
        <Notice tone="warning">This finding isn’t on this phone.</Notice>
      </Screen>
    );
  }

  function save() {
    const e = validateFinding({ title, severity_key: severity });
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const values: Record<string, JsonValue> = {
      title: title.trim(),
      job_component_id: componentId,
      severity_key: severity,
      location_text: location.trim() || null,
      pin_x: pin?.x ?? null,
      pin_y: pin?.y ?? null,
      status,
      notes: notes.trim() || null,
    };
    if (existing) services.sync.write("finding", existing.id, company.id, values);
    else services.sync.insert("finding", company.id, { ...values, job_id: jobId });
    router.back();
  }

  function remove() {
    Alert.alert("Delete this finding?", undefined, [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          services.sync.write("finding", existing!.id, company.id, {
            deleted_at: new Date().toISOString(),
          });
          router.back();
        },
      },
    ]);
  }

  const sevColor = config.severityByKey.get(severity)?.color ?? color.fail;
  const others = insp.findings.filter(
    (f) => f.id !== existing?.id && f.pin_x != null && f.pin_y != null,
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? "Finding" : "New Finding" }} />
      <Field
        label="What did you find?"
        value={title}
        onChangeText={setTitle}
        error={errors.title}
        placeholder="Return 3 line break"
      />
      <Segmented
        label="Severity"
        options={config.severities.map((s) => ({ value: s.key, label: s.name }))}
        value={severity || null}
        onChange={setSeverity}
      />
      {errors.severity_key ? (
        <T variant="small" style={{ color: color.fail }}>
          {errors.severity_key}
        </T>
      ) : null}
      <Choice
        label="Component"
        options={[
          { value: "", label: "None" },
          ...insp.components.map((c) => ({ value: c.id, label: c.label })),
        ]}
        value={componentId ?? ""}
        onChange={(v) => setComponentId(v || null)}
      />
      <Field
        label="Location"
        value={location}
        onChangeText={setLocation}
        placeholder="Between pad and pool, 6 ft from the fitting"
      />

      <Section
        title="Pin on the diagram"
        action={
          pin ? <Button title="Clear Pin" kind="quiet" onPress={() => setPin(null)} /> : undefined
        }
      >
        <T variant="muted">{pin ? "Tap again to move the pin." : "Tap where the leak is."}</T>
        {property ? (
          <PoolDiagram
            shape={property.diagram_shape}
            hasSpa={property.has_spa}
            onPlace={(x, y) => setPin({ x, y })}
            pins={[
              ...others.map((f) => ({
                id: f.id,
                x: Number(f.pin_x),
                y: Number(f.pin_y),
                color: color.excluded,
                label: "",
              })),
              ...(pin
                ? [{ id: "this", x: pin.x, y: pin.y, color: sevColor, label: "!", active: true }]
                : []),
            ]}
          />
        ) : null}
      </Section>

      {existing ? (
        <Segmented
          label="Status"
          options={[
            { value: "open", label: "Open" },
            { value: "monitor", label: "Monitor" },
            { value: "quoted", label: "Quoted" },
            { value: "repaired", label: "Repaired" },
          ]}
          value={status}
          onChange={setStatus}
        />
      ) : null}
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
      <MediaSection
        target={{ jobId, findingId: existing?.id }}
        disabledReason={existing ? undefined : "Save the finding first, then add photos."}
      />
      {Object.keys(errors).length > 0 ? (
        <Notice tone="error">Fix the highlighted fields.</Notice>
      ) : null}
      <Button title="Save Finding" onPress={save} />
      {existing ? <Button title="Delete Finding" kind="danger" onPress={remove} /> : null}
    </Screen>
  );
}
