import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  MIN_INK,
  calculate,
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
import { REPORT_STEPS, finishReportFromPhone, useJobReports } from "../../../../data/reports";
import { StepList } from "../../../../ui/Progress";
import { FinishPhotoNotice, useNeedsFinishPhoto } from "../../../../features/media/FinishPhoto";
import { currentPosition, storeSignatureSvg } from "../../../../lib/media";
import { useCompany, useSession } from "../../../../state/session";
import {
  Button,
  Card,
  Field,
  HeaderButton,
  Notice,
  Screen,
  Segmented,
  T,
} from "../../../../ui/components";
import { PadBlock } from "../../../../features/report/PadBlock";
import { ReportTests } from "../../../../features/report/ReportTests";
import { confirmDiscard, useBackPrompt } from "../../../../ui/sheet";
import { color, face, space } from "../../../../ui/theme";

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
  const [step, setStep] = useState(0);
  const [drawing, setDrawing] = useState(false);
  // Signing finishes the report, so it waits for a photo when the shop requires one (owner
  // setting, 2026-10-19).
  const needsPhoto = useNeedsFinishPhoto(id);

  // A drawn signature isn't thrown away without asking: Cancel and Android's back button
  // (owner, 2026-10-20). Finishing leaves without asking.
  const signed = strokes.length > 0 && busy === null;
  function cancel() {
    if (!signed) return router.back();
    confirmDiscard(() => router.back());
  }
  useBackPrompt(signed, cancel);

  const bar = (
    <Stack.Screen
      options={{
        title: "Review and Sign",
        headerBackVisible: false,
        gestureEnabled: !signed,
        headerLeft: () => <HeaderButton title="Cancel" onPress={cancel} />,
      }}
    />
  );

  if (!job) {
    return (
      <Screen>
        {bar}
        <Notice tone="warning">This job isn’t on this phone.</Notice>
      </Screen>
    );
  }

  const address = property ? formatAddress(property) : "";
  const signer = (name ?? customer?.name ?? "").trim();
  const tally = checklistTally(insp.components, insp.results);
  const maintenance = job.type === "maintenance";
  const written = (draft?.final_sections ?? []).filter((s) => s.text.trim());
  // The draft's tests text goes with the tests themselves, as on the website's report.
  const sections = written.filter((s) => s.key !== "tests");
  const testsText = written.find((s) => s.key === "tests");
  const findings = [...insp.findings].sort((a, b) => a.id.localeCompare(b.id));

  async function finish(customerAway: boolean) {
    setError(null);
    if (needsPhoto) return;
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
      setStep(0);
      await finishReportFromPhone(draft.id, customerAway, setStep);
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
      {bar}
      <T muted>Please read your report. Sign at the bottom to confirm the visit.</T>
      <Card>
        <T variant="secondary" muted style={face.semiBold}>
          {company.name}
        </T>
        <T variant="sectionHeading">{maintenance ? "Service Report" : "Leak Detection Report"}</T>
        <T variant="bodyEmphasis">{customer?.name ?? "Customer"}</T>
        {address ? <T variant="secondary">{address}</T> : null}
        <T variant="secondary" muted>
          {new Date().toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </T>
      </Card>

      {sections.length ? (
        sections.map((s) => (
          <Card key={s.key}>
            <T variant="cardTitle">{s.title}</T>
            <T>{s.text}</T>
          </Card>
        ))
      ) : (
        <Notice>
          The written summary is added before the report is sent. Below is what was checked and
          found today.
        </Notice>
      )}

      {findings.length ? (
        <Card>
          <T variant="cardTitle">Findings</T>
          {findings.map((f, i) => {
            const sev = config.severityByKey.get(f.severity_key);
            const comp = f.job_component_id
              ? insp.componentById.get(f.job_component_id)
              : undefined;
            return (
              <View key={f.id} style={{ gap: 2 }}>
                <T variant="bodyEmphasis">{`${i + 1}. ${f.title}`}</T>
                <T variant="secondary" muted>
                  {[sev?.name, comp?.label, f.location_text].filter(Boolean).join(" · ")}
                </T>
              </View>
            );
          })}
        </Card>
      ) : null}

      <Card>
        <T variant="cardTitle">Checklist</T>
        <T>
          {maintenance
            ? `${tally.pass} done · ${tally.attention} need attention · ${tally.notApplicable} skipped`
            : `${tally.pass} not leaking · ${tally.attention} attention · ${tally.leaking} leaking · ${tally.notApplicable} not applicable`}
        </T>
        {tally.pending ? <T variant="secondary" muted>{`${tally.pending} still to do`}</T> : null}
      </Card>

      {/* Tests we ran: every test, after what was checked (owner, 2026-10-19). */}
      <ReportTests
        title={testsText?.title}
        text={testsText?.text}
        tests={insp.tests.map((t) => {
          const type = config.testTypeById.get(t.test_type_id);
          return {
            id: t.id,
            name: type?.name ?? "Test",
            where: t.job_component_id
              ? (insp.componentById.get(t.job_component_id)?.label ?? null)
              : null,
            result: type
              ? (calculate(type, t.data).summary ??
                (Object.values(t.data).filter(Boolean).join(", ") || null))
              : null,
            outcome: t.outcome,
          };
        })}
      />

      <View style={[styles.sign, { borderTopColor: color.separator }]}>
        {tally.pending ? (
          <Notice tone="warning">
            {`${tally.pending} checklist ${tally.pending === 1 ? "item is" : "items are"} still to do. Finish the checklist, then come back to sign.`}
          </Notice>
        ) : purposes.length ? (
          <>
            <T variant="largeTitle">Please Sign</T>
            {purposes.length > 1 ? (
              <Segmented
                label="Signing for"
                options={purposes}
                value={purpose}
                onChange={setPurpose}
              />
            ) : null}
            {purpose ? (
              <Card>
                <T style={styles.statement}>
                  {signatureStatement(purpose, company.name, address || null)}
                </T>
              </Card>
            ) : null}
            {/* The customer types here, so the phone doesn't offer the tech's own name. */}
            <Field
              label="Your name"
              value={name ?? customer?.name ?? ""}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect={false}
              autoComplete="off"
              textContentType="none"
            />
            <Field
              label="Role (optional)"
              value={role}
              onChangeText={setRole}
              placeholder="Homeowner, property manager…"
              autoComplete="off"
              textContentType="none"
            />
            <PadBlock
              strokes={strokes}
              setStrokes={setStrokes}
              setDrawing={setDrawing}
              onInk={() => setError(null)}
            />
          </>
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        {!tally.pending && needsPhoto ? <FinishPhotoNotice jobId={job.id} /> : null}
        {tally.pending ? null : (
          <>
            <Button
              title={
                busy === "sign"
                  ? "Finishing…"
                  : purposes.length
                    ? "Sign and Finish"
                    : "Finish Report"
              }
              wide
              disabled={busy !== null || needsPhoto}
              onPress={() => void finish(false)}
            />
            {busy && draft ? (
              <StepList steps={REPORT_STEPS.finish} at={step} label="Finishing the report" />
            ) : null}
            {purposes.length ? (
              <>
                <T variant="secondary" muted>
                  For the tech: nobody here to sign? Finish the report without a signature. It will
                  say the customer wasn’t present.
                </T>
                <Button
                  title={busy === "away" ? "Finishing…" : "Customer Not Here"}
                  kind="quiet"
                  disabled={busy !== null || needsPhoto}
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

const styles = StyleSheet.create({
  statement: { fontSize: 19, lineHeight: 28 },
  sign: { gap: space["4"], borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space["5"] },
});
