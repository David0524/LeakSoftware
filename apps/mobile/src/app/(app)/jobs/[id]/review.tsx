import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import {
  MIN_INK,
  checklistTally,
  formatAddress,
  inkLength,
  reportSignOffPurposes,
  signatureStatement,
  signatureStoragePath,
  signatureSvg,
  uuidv7,
  type Customer,
  type Job,
  type Property,
  type SignaturePurpose,
  type SignatureStroke,
} from "@leakbook/core";
import { useRow } from "../../../../data/hooks";
import { useInspectionConfig, useJobInspection } from "../../../../data/inspection";
import { finishReportFromPhone, useJobReports } from "../../../../data/reports";
import { OutcomeChip } from "../../../../features/inspection/OutcomeChip";
import { currentPosition, storeSignatureSvg } from "../../../../lib/media";
import { useCompany, useSession } from "../../../../state/session";
import { Button, Card, Choice, Field, Notice, Row, Screen, T } from "../../../../ui/components";
import { SignaturePad } from "../../../../ui/SignaturePad";
import { color } from "../../../../ui/theme";

/**
 * Review with Customer (owner request, 2026-10-13): the customer reads the report on the
 * tech's phone and signs at the bottom; signing finishes the report. Works offline: the
 * report is built from this phone's data, without the written summary until the draft is
 * written, and the report is finished once the phone is back online.
 */
export default function ReviewScreen() {
  const { id, template = "homeowner" } = useLocalSearchParams<{ id: string; template?: string }>();
  const company = useCompany();
  const { services } = useSession();
  const job = useRow<Job>("job", id);
  const property = useRow<Property>("property", job?.property_id);
  const customer = useRow<Customer>("customer", job?.bill_to_customer_id ?? property?.customer_id);
  const config = useInspectionConfig(company.id);
  const insp = useJobInspection(company.id, id);
  const reports = useJobReports(company.id, id);
  const draft = reports.find((r) => r.template_key === template && r.status === "draft");
  const purposes = reportSignOffPurposes(company.settings);
  const [purpose, setPurpose] = useState<SignaturePurpose | null>(purposes[0]?.value ?? null);
  const [name, setName] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"sign" | "away" | null>(null);
  const [drawing, setDrawing] = useState(false);

  if (!job) {
    return (
      <Screen>
        <Notice tone="warning">This job isn’t on this phone.</Notice>
      </Screen>
    );
  }

  const address = property ? formatAddress(property) : "";
  const signer = (name ?? customer?.name ?? "").trim();
  const tally = checklistTally(insp.components, insp.results);
  const maintenance = job.type === "maintenance";
  const sections = (draft?.final_sections ?? []).filter((s) => s.text.trim());
  const findings = [...insp.findings].sort((a, b) => a.id.localeCompare(b.id));

  async function finish(customerAway: boolean) {
    setError(null);
    if (!customerAway && purposes.length) {
      if (!purpose) return setError("Choose what this signature is for.");
      if (!signer) return setError("Enter your name.");
      if (inkLength(strokes) < MIN_INK) return setError("Sign in the box with your finger.");
    }
    if (customerAway && !draft) return setError("Write the draft first, then finish it here.");
    setBusy(customerAway ? "away" : "sign");
    if (!customerAway && purpose) {
      // Saved on the phone first, so the signature is kept even without signal.
      const sigId = uuidv7();
      const localPath = storeSignatureSvg(sigId, signatureSvg(strokes));
      const where = await currentPosition();
      const storagePath = signatureStoragePath(company.id, job!.id, sigId);
      services.sync.addSignature(
        sigId,
        company.id,
        {
          job_id: job!.id,
          purpose,
          signer_name: signer,
          signer_role: role.trim() || null,
          image_path: storagePath,
          signed_at: new Date().toISOString(),
          latitude: where?.latitude ?? null,
          longitude: where?.longitude ?? null,
        },
        { localPath, storagePath },
      );
    }
    if (!draft) {
      // Offline or before the draft: the report is finished from the Report tab later.
      router.back();
      return;
    }
    try {
      await finishReportFromPhone(draft.id, customerAway);
      router.back();
    } catch (e) {
      if (customerAway) {
        setError(e instanceof Error ? e.message : String(e));
        setBusy(null);
        return;
      }
      // Signed, but not finished yet: the Report tab offers Finish Report.
      router.back();
    }
  }

  // The page scrolls, but holds still while a finger is on the pad.
  return (
    <Screen scrollEnabled={!drawing}>
      <T variant="muted">Please read your report. Sign at the bottom to confirm the visit.</T>
      <Card>
        <T variant="muted">{company.name}</T>
        <T variant="title">{maintenance ? "Service Report" : "Leak Detection Report"}</T>
        <T variant="strong">{customer?.name ?? "Customer"}</T>
        {address ? <T variant="small">{address}</T> : null}
        <T variant="muted">{new Date().toLocaleDateString()}</T>
      </Card>

      {sections.length ? (
        sections.map((s) => (
          <Card key={s.key}>
            <T variant="heading">{s.title}</T>
            <T>{s.text}</T>
          </Card>
        ))
      ) : (
        <Notice>
          The written summary is added before the report is sent. Below is what was checked and
          found today.
        </Notice>
      )}

      <Card>
        <T variant="heading">Checklist</T>
        <T>
          {maintenance
            ? `${tally.pass} done · ${tally.attention} need attention · ${tally.notApplicable} skipped`
            : `${tally.pass} not leaking · ${tally.attention} attention · ${tally.leaking} leaking · ${tally.notApplicable} not applicable`}
        </T>
        {tally.pending ? <T variant="muted">{`${tally.pending} still to do`}</T> : null}
      </Card>

      {findings.length ? (
        <Card>
          <T variant="heading">Findings</T>
          {findings.map((f, i) => {
            const sev = config.severityByKey.get(f.severity_key);
            const comp = f.job_component_id
              ? insp.componentById.get(f.job_component_id)
              : undefined;
            return (
              <View key={f.id} style={{ gap: 2 }}>
                <T variant="strong">{`${i + 1}. ${f.title}`}</T>
                <T variant="muted">
                  {[sev?.name, comp?.label, f.location_text].filter(Boolean).join(" · ")}
                </T>
              </View>
            );
          })}
        </Card>
      ) : null}

      {insp.tests.length ? (
        <Card>
          <T variant="heading">Tests</T>
          {insp.tests.map((t) => (
            <Row key={t.id} style={{ justifyContent: "space-between" }}>
              <T style={{ flex: 1 }}>{config.testTypeById.get(t.test_type_id)?.name ?? "Test"}</T>
              <OutcomeChip outcome={t.outcome} />
            </Row>
          ))}
        </Card>
      ) : null}

      <View style={{ gap: 12, borderTopWidth: 2, borderTopColor: color.text, paddingTop: 16 }}>
        {tally.pending ? (
          <Notice tone="warning">
            {`${tally.pending} checklist ${tally.pending === 1 ? "item is" : "items are"} still to do. Finish the checklist, then come back to sign.`}
          </Notice>
        ) : purposes.length ? (
          <>
            <T variant="title">Please Sign</T>
            {purposes.length > 1 ? (
              <Choice
                label="Signing for"
                options={purposes}
                value={purpose}
                onChange={setPurpose}
              />
            ) : null}
            {purpose ? (
              <T style={{ fontSize: 19, lineHeight: 26 }}>
                {signatureStatement(purpose, company.name, address || null)}
              </T>
            ) : null}
            <Field
              label="Your name"
              value={name ?? customer?.name ?? ""}
              onChangeText={setName}
              autoCapitalize="words"
              textContentType="name"
            />
            <Field
              label="Role (optional)"
              value={role}
              onChangeText={setRole}
              placeholder="Homeowner, property manager…"
            />
            <SignaturePad
              strokes={strokes}
              onDrawing={setDrawing}
              onChange={(s) => {
                setStrokes(s);
                setError(null);
              }}
            />
            <Row style={{ justifyContent: "flex-end" }}>
              <Button
                title="Clear"
                kind="quiet"
                onPress={() => setStrokes([])}
                disabled={strokes.length === 0}
              />
            </Row>
          </>
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        {tally.pending ? null : (
          <>
            <Button
              title={purposes.length ? "Sign" : "Finish Report"}
              loading={busy === "sign"}
              disabled={busy !== null}
              onPress={() => void finish(false)}
            />
            {purposes.length ? (
              <>
                <T variant="muted">
                  For the tech: nobody here to sign? Finish the report without a signature. It will
                  say the customer wasn’t present.
                </T>
                <Button
                  title="Customer Not Here"
                  kind="quiet"
                  loading={busy === "away"}
                  disabled={busy !== null}
                  onPress={() => void finish(true)}
                />
              </>
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}
