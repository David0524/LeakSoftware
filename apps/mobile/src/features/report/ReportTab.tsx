import { router } from "expo-router";
import { File, Paths } from "expo-file-system";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import * as WebBrowser from "expo-web-browser";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import {
  SIGNATURE_PURPOSE_LABELS,
  enabledSignaturePurposes,
  formatSchedule,
  isManagerRole,
  reportTitle,
  splitEmails,
  type Customer,
  type FinalSection,
  type Job,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useRows, useSyncStatus } from "../../data/hooks";
import {
  REPORT_STEPS,
  finishReportFromPhone,
  UploadsPendingError,
  reportsOnline,
  sendReportFromPhone,
  useJobReports,
  useJobSignatures,
  writeReportDraft,
  type SignatureRecord,
} from "../../data/reports";
import { AUTOSAVE_DELAY_MS } from "../../lib/autosave";
import { API_URL } from "../../lib/config";
import {
  forgetReportRequest,
  queueReportRequest,
  useQueuedReportRequests,
  watchReportRequests,
} from "../../lib/reportQueue";
import { queuedMessage } from "../../lib/reportRequests";
import { getServices } from "../../lib/services";
import { useCompany, useSession } from "../../state/session";
import { Button, Card, Field, Notice, T } from "../../ui/components";
import { confirmDestructive } from "../../ui/confirm";
import { haptics } from "../../ui/haptics";
import { color, face, MAX_TEXT_SCALE, minTap, space } from "../../ui/theme";
import { StepList } from "../../ui/Progress";
import { WebIcon } from "../../ui/WebIcon";
import { SaveAsSavedReportSheet, UseSavedReportSheet } from "./SavedReportPicker";
import { FinishPhotoNotice, useNeedsFinishPhoto } from "../media/FinishPhoto";

type Template = "homeowner" | "partner";

type Status = { tone: "success" | "error" | "info"; text: string };

interface TemplateRow {
  key: string;
  name: string;
  enabled: boolean;
}

/** A 0.5 pt line between the parts of a card. */
export function Divider() {
  return <View style={[styles.divider, { backgroundColor: color.separator }]} />;
}

/** A link-colored text button, at least 44 tall ("Show Draft", "View version 2"). */
function LinkButton({
  title,
  onPress,
  underline = false,
  trailing,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  underline?: boolean;
  trailing?: ReactNode;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed && { opacity: 0.5 }]}
    >
      <Text
        style={[
          styles.linkText,
          { color: color.link },
          underline ? { textDecorationLine: "underline", ...face.regular } : null,
        ]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
      >
        {title}
      </Text>
      {trailing}
    </Pressable>
  );
}

/** A full-width disclosure row ("Report Text", "Versions (3)"): a chevron that turns open. */
function Disclosure({
  title,
  open,
  onPress,
}: {
  title: string;
  open: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={({ pressed }) => [styles.disclosure, pressed && { opacity: 0.5 }]}
    >
      <Text
        style={[styles.linkText, { color: color.text, flex: 1 }]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
      >
        {title}
      </Text>
      <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
        <WebIcon name="chevronRight" size={18} color={color.textMuted} strokeWidth={2.2} />
      </View>
    </Pressable>
  );
}

/** What the job page's Next Step bar can ask of the report (Write Draft, Review). */
export interface ReportControls {
  writeDraft: () => void;
  review: () => void;
}

/**
 * Report and Sign-Off (spec 5.4 Wrap-Up): the homeowner report's card. The finished version's
 * send controls first, under its status line (owner, 2026-10-20: one-handed use, item 6); then
 * Write Draft, the draft's text folded under Report Text (saved by itself as you type), Review
 * with Customer, sending without a signature, and the versions sent folded under Versions.
 * Offline, Finish Report and sending wait on the phone and go once the signal is back.
 */
export function ReportTab({
  job,
  customer,
  controls,
}: {
  job: Job;
  customer: Customer | undefined;
  controls?: RefObject<ReportControls | null>;
}) {
  const company = useCompany();
  const { services, membership } = useSession();
  const canManage = isManagerRole(membership?.role);
  const signatures = useJobSignatures(company.id, job.id);
  const reports = useJobReports(company.id, job.id);
  const templateRows = useRows<TemplateRow>("report_template", company.id);
  // One report, the homeowner's (owner, 2026-10-18: "Partner report should be gone").
  const template: Template = "homeowner";
  const templateRow = useMemo(() => templateRows.find((t) => t.key === template), [templateRows]);
  const draft = reports.find((r) => r.template_key === template && r.status === "draft");
  const sent = reports.filter((r) => r.template_key === template && r.status !== "draft");
  const finished = sent.find((r) => r.status === "sent");
  // Signed on this phone but not yet part of a finished version (signed offline).
  const waiting = signatures.filter((s) => !s.report_id && s.purpose !== "quote_acceptance");
  const offline = useSyncStatus().phase === "offline";
  const queued = useQueuedReportRequests(job.id);

  const [open, setOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<"draft" | "email" | "text" | "finish" | null>(null);
  // The step of the wait on the server (StepList).
  const [step, setStep] = useState(0);
  const [picking, setPicking] = useState(false);
  const [savingAs, setSavingAs] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [sendStatus, setSendStatus] = useState<Status | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const email = (to ?? customer?.email ?? "").trim();
  const [otherEmails, setOtherEmails] = useState<string | null>(null);
  // Finishing a draft (Finish Report, or sending it) waits for a photo when the shop requires
  // one (owner setting, 2026-10-19). A finished version is sent as is, as on the website.
  const needsPhoto = useNeedsFinishPhoto(job.id);
  const [photoAsked, setPhotoAsked] = useState<"finish" | "send" | null>(null);

  const sections = draft?.final_sections ?? [];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Saves the typed report text in one write, so no edit overwrites another (owner,
   * 2026-10-20: no Save Text; it saves 1 second after typing stops, and when the field or
   * screen is left). While typing it keeps the text as typed; leaving trims it.
   */
  function persist(leaving: boolean): boolean {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!draft) return false;
    const changed = sections.some((s) => edits[s.key] !== undefined && edits[s.key] !== s.text);
    if (changed) {
      const next: FinalSection[] = sections.map((s) =>
        edits[s.key] === undefined
          ? s
          : { ...s, text: leaving ? edits[s.key]!.trim() : edits[s.key]! },
      );
      services.sync.write("report", draft.id, company.id, {
        final_sections: next as unknown as JsonValue,
      });
      setSaved(true);
    }
    if (leaving && Object.keys(edits).length) setEdits({});
    return changed;
  }
  const persistNow = useRef(persist);
  useEffect(() => {
    persistNow.current = persist;
  });
  useEffect(() => () => void persistNow.current(true), []);

  /** Write Draft, also from the Next Step bar. Writing again asks first (it replaces text). */
  function writeDraft() {
    if (!draft?.final_sections) return void run("draft");
    confirmDestructive({
      title: "Write the draft again?",
      message: "The new draft replaces this one, including your edits.",
      confirm: "Replace Draft",
      onConfirm: () => void run("draft"),
    });
  }
  const review = () => {
    persist(true);
    router.push(`/jobs/${job.id}/review?template=${template}`);
  };
  // The Next Step bar's Write Draft and Review with Customer do what these buttons do.
  useEffect(() => {
    if (controls) controls.current = { writeDraft, review };
  });

  if (templateRow?.enabled === false) return null;

  const hasDraft = Boolean(draft?.final_sections);
  const problems = draft?.ai_draft?.problems ?? [];
  // The draft as it reads now, unsaved edits included.
  const current: FinalSection[] = sections.map((s) =>
    edits[s.key] === undefined ? s : { ...s, text: edits[s.key]! },
  );

  /** Use Saved Report: the saved text goes in word for word, saved like an edit. */
  function applySaved(next: FinalSection[], name: string) {
    if (!draft) return;
    if (timer.current) clearTimeout(timer.current);
    services.sync.write("report", draft.id, company.id, {
      final_sections: next as unknown as JsonValue,
    });
    setEdits({});
    setSaved(false);
    haptics.success();
    setStatus({ tone: "success", text: `Used “${name}”. Read it over before sending.` });
  }

  /** Other emails are saved on the customer, so later reports and quotes use them too. */
  function saveOtherEmails() {
    if (!customer || otherEmails === null) return;
    const next = splitEmails(otherEmails);
    if (next.join(" ") !== (customer.cc_emails ?? []).join(" "))
      services.sync.write("customer", customer.id, company.id, { cc_emails: next });
    setOtherEmails(null);
  }

  /**
   * No signal: Finish Report and sending wait on the phone (owner, 2026-10-20) and go once the
   * signal is back and the job's changes are on the server.
   */
  function queueForLater(
    kind: "email" | "text" | "finish",
    reportId: string,
    waitingFor?: "uploads",
  ) {
    const sending = kind !== "finish";
    if (kind === "email" && !/^\S+@\S+\.\S+$/.test(email))
      return setSendStatus({ tone: "error", text: "Enter the customer’s email." });
    queueReportRequest({
      kind,
      reportId,
      jobId: job.id,
      to: kind === "email" ? email : kind === "text" ? (customer?.phone ?? null) : null,
      ...(waitingFor ? { waitingFor } : {}),
    });
    haptics.success();
    (sending ? setSendStatus : setStatus)({ tone: "info", text: queuedMessage({ waitingFor }) });
  }

  async function run(kind: "draft" | "email" | "text" | "finish", reportId = draft?.id) {
    setBusy(kind);
    setStep(0);
    const sending = kind === "email" || kind === "text";
    (sending ? setSendStatus : setStatus)(null);
    setPhotoAsked(null);
    if (needsPhoto && (kind === "finish" || (sending && reportId === draft?.id))) {
      setBusy(null);
      return setPhotoAsked(sending ? "send" : "finish");
    }
    if (kind !== "draft") {
      persist(true);
      if (sending) saveOtherEmails();
      if (offline && reportId) {
        setBusy(null);
        return queueForLater(kind, reportId);
      }
      // Tapped again with a signal: this one goes now, not the one waiting too.
      if (reportId) forgetReportRequest(kind, reportId);
    }
    try {
      if (kind === "draft") {
        const r = await writeReportDraft(job.id, template, setStep);
        setEdits({});
        setOpen(true);
        setStatus({
          tone: "success",
          text: r.problems.length
            ? `Draft written. ${r.problems.length} thing${r.problems.length === 1 ? "" : "s"} to check below.`
            : "Draft written. Read it over and edit anything before sending.",
        });
      } else if (kind === "finish") {
        await finishReportFromPhone(reportId!, false, setStep);
        setStatus({ tone: "success", text: "Report finished. Send it to the customer below." });
      } else {
        if (kind === "email" && !/^\S+@\S+\.\S+$/.test(email))
          throw new Error("Enter the customer’s email.");
        const r = await sendReportFromPhone(
          reportId!,
          kind === "email" ? "email" : "sms_device",
          kind === "email" ? email : (customer?.phone ?? null),
          setStep,
        );
        if (kind === "text") {
          await Share.share({ message: r.message });
          setSendStatus({ tone: "success", text: "Report sent." });
        } else setSendStatus({ tone: "success", text: `Sent to ${email}.` });
      }
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      // Photos still uploading: it waits on the phone and goes once they're up.
      if (kind !== "draft" && reportId && e instanceof UploadsPendingError)
        queueForLater(kind, reportId, "uploads");
      // Lost the signal on the way: it waits on the phone instead (not Write Draft).
      else if (kind !== "draft" && reportId && /connection|signal/i.test(text))
        queueForLater(kind, reportId);
      else (sending ? setSendStatus : setStatus)({ tone: "error", text });
    } finally {
      setBusy(null);
    }
  }

  // Email or text one report: the draft (unsigned) or a finished version.
  const sendControls = (reportId: string, primary: boolean) => (
    <View style={styles.stack}>
      <Field
        label="Customer email"
        value={to ?? customer?.email ?? ""}
        onChangeText={setTo}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        textContentType="none"
      />
      {customer ? (
        <Field
          label="Other emails (optional)"
          value={otherEmails ?? (customer.cc_emails ?? []).join(" ")}
          onChangeText={setOtherEmails}
          onBlur={saveOtherEmails}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          textContentType="none"
          hint="They get the report too. Separate with spaces."
        />
      ) : null}
      <View style={styles.row}>
        <Button
          title={busy === "email" ? "Sending…" : "Send by Email"}
          kind={primary ? "primary" : "secondary"}
          disabled={busy !== null || !reportsOnline}
          onPress={() => {
            setSendingId(reportId);
            void run("email", reportId);
          }}
        />
        <Button
          title="Send by Text"
          kind="secondary"
          disabled={busy !== null || !reportsOnline}
          onPress={() => {
            setSendingId(reportId);
            void run("text", reportId);
          }}
        />
      </View>
      {(busy === "email" || busy === "text") && sendingId === reportId ? (
        <StepList steps={REPORT_STEPS.send} at={step} label="Sending the report" />
      ) : null}
      {queued.some((r) => r.reportId === reportId && r.kind !== "finish") ? (
        <Notice>
          {queuedMessage(queued.find((r) => r.reportId === reportId && r.kind !== "finish")!)}
        </Notice>
      ) : sendStatus && sendingId === reportId ? (
        <Notice tone={sendStatus.tone}>{sendStatus.text}</Notice>
      ) : null}
    </View>
  );

  const when = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "";

  return (
    <Card style={styles.card}>
      <View style={styles.titleRow}>
        <T variant="cardTitle" style={{ flexShrink: 1 }}>
          {/* A pool inspection's report is named for it (2026-10-20), as the website. */}
          {job.type === "inspection"
            ? reportTitle("inspection")
            : (templateRow?.name ?? "Homeowner report")}
        </T>
        {finished?.token && API_URL ? (
          <LinkButton
            title={`View version ${finished.version}`}
            underline
            onPress={() => void WebBrowser.openBrowserAsync(`${API_URL}/r/${finished.token}`)}
          />
        ) : null}
      </View>

      {/* The finished version's status, then its send controls, before anything else. */}
      {finished ? (
        <View style={styles.stack}>
          <View style={styles.part}>
            <T variant="bodyMedium">{`Version ${finished.version} is finished`}</T>
            <T variant="secondary" muted>
              Send it to the customer, or download the PDF.
            </T>
          </View>
          {sendControls(finished.id, !hasDraft)}
          {finished.token && API_URL ? (
            <Button
              title="Download PDF"
              kind="quiet"
              style={{ marginLeft: -space["3"], paddingHorizontal: space["3"] }}
              onPress={() =>
                router.push(
                  `/jobs/${job.id}/pdf?token=${finished.token}&version=${finished.version}`,
                )
              }
            />
          ) : null}
          <Divider />
        </View>
      ) : hasDraft && draft ? (
        <T variant="secondary" muted>
          {`Draft version ${draft.version} is ready to read, edit, and review with the customer.`}
        </T>
      ) : null}

      {!reportsOnline ? (
        <Notice tone="warning">
          This app isn’t connected to the Sundeck Pro server, so reports can’t be written here. Use
          the office website.
        </Notice>
      ) : (
        <Button
          title={busy === "draft" ? "Writing…" : hasDraft ? "Write the Draft Again" : "Write Draft"}
          kind={hasDraft ? "secondary" : "primary"}
          disabled={busy !== null}
          onPress={writeDraft}
        />
      )}
      {!hasDraft && !finished ? (
        // Offline, or before the draft: the customer can still read and sign on this phone.
        <Button
          title="Review with Customer"
          kind="secondary"
          disabled={busy !== null}
          onPress={review}
        />
      ) : null}
      {busy === "draft" || busy === "finish" ? (
        <StepList
          steps={busy === "draft" ? REPORT_STEPS.draft : REPORT_STEPS.finish}
          at={step}
          label={busy === "draft" ? "Writing the draft" : "Finishing the report"}
        />
      ) : null}
      {queued.some((r) => r.kind === "finish") ? (
        <Notice>{queuedMessage(queued.find((r) => r.kind === "finish")!)}</Notice>
      ) : status ? (
        <Notice tone={status.tone}>{status.text}</Notice>
      ) : null}
      {photoAsked === "finish" && needsPhoto ? <FinishPhotoNotice jobId={job.id} /> : null}

      {hasDraft && draft ? (
        <View style={styles.stack}>
          <Disclosure title="Report Text" open={open} onPress={() => setOpen(!open)} />
          {open ? (
            <>
              {problems.length ? (
                <Notice tone="warning">
                  <T variant="bodyEmphasis">Check these before sending:</T>
                  {problems.map((p, i) => (
                    <T key={i}>{`•  ${p.message}`}</T>
                  ))}
                </Notice>
              ) : null}
              <Button
                title="Use Saved Report"
                kind="secondary"
                disabled={busy !== null}
                onPress={() => setPicking(true)}
              />
              {sections.map((s) => (
                <Field
                  key={`${draft.id}-${s.key}`}
                  label={s.title}
                  value={edits[s.key] ?? s.text}
                  onChangeText={(v) => {
                    setSaved(false);
                    setEdits((e) => ({ ...e, [s.key]: v }));
                    if (timer.current) clearTimeout(timer.current);
                    timer.current = setTimeout(() => persistNow.current(false), AUTOSAVE_DELAY_MS);
                  }}
                  onBlur={() => persist(true)}
                  multiline
                />
              ))}
              {saved ? (
                <View accessibilityLiveRegion="polite">
                  <T variant="secondary" muted>
                    Saved
                  </T>
                </View>
              ) : null}
              {canManage ? (
                <LinkButton title="Save as Saved Report" onPress={() => setSavingAs(true)} />
              ) : null}
              <UseSavedReportSheet
                open={picking}
                onClose={() => setPicking(false)}
                sections={current}
                onApply={applySaved}
                canManage={canManage}
              />
              <SaveAsSavedReportSheet
                open={savingAs}
                onClose={() => setSavingAs(false)}
                sections={current}
                onSaved={(name) => {
                  setSavingAs(false);
                  setStatus({
                    tone: "success",
                    text: `Saved as “${name}”. The team can use it on any report.`,
                  });
                }}
              />
            </>
          ) : null}

          <Divider />
          <View style={styles.part}>
            <T variant="bodyMedium">{`Finish version ${draft.version}`}</T>
            <T variant="secondary" muted>
              {waiting.length
                ? `Signed by ${waiting.map((w) => w.signer_name).join(", ")}. Finish the report to lock this version with the signature.`
                : "Hand the phone to the customer: they read the report and sign at the bottom. Signing locks this version; changes after that go out as a new version."}
            </T>
          </View>
          {waiting.length ? (
            <Button
              title={busy === "finish" ? "Finishing…" : "Finish Report"}
              disabled={busy !== null || !reportsOnline}
              onPress={() => void run("finish")}
            />
          ) : (
            <Button title="Review with Customer" disabled={busy !== null} onPress={review} />
          )}
          <LinkButton
            title="Send Without a Signature"
            accessibilityLabel={`Send Without a Signature, ${sendOpen ? "expanded" : "collapsed"}`}
            onPress={() => setSendOpen(!sendOpen)}
            trailing={
              <View style={{ transform: [{ rotate: sendOpen ? "90deg" : "0deg" }] }}>
                <WebIcon name="chevronRight" size={18} color={color.link} strokeWidth={2} />
              </View>
            }
          />
          {sendOpen ? (
            <>
              <T variant="secondary" muted>
                Sending saves your edits and locks this version.
              </T>
              {sendControls(draft.id, false)}
            </>
          ) : null}
        </View>
      ) : null}
      {photoAsked === "send" && needsPhoto ? <FinishPhotoNotice jobId={job.id} /> : null}

      {sent.length ? (
        <View style={styles.stack}>
          <Divider />
          {/* Earlier versions, folded (owner, 2026-10-20). */}
          <Disclosure
            title={`Versions (${sent.length})`}
            open={versionsOpen}
            onPress={() => setVersionsOpen(!versionsOpen)}
          />
          {versionsOpen ? (
            <View>
              {sent.map((r, i) => (
                <View
                  key={r.id}
                  style={[
                    styles.version,
                    i > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: color.separator,
                    },
                  ]}
                >
                  <T variant="secondary">
                    {`Version ${r.version}`}
                    <T variant="secondary" muted>
                      {` · ${when(r.sent_at)}${r.status === "superseded" ? " · replaced" : ""}`}
                    </T>
                  </T>
                  {r.token && API_URL ? (
                    <View style={styles.versionLinks}>
                      <Button
                        title="Report"
                        kind="quiet"
                        small
                        onPress={() => void WebBrowser.openBrowserAsync(`${API_URL}/r/${r.token}`)}
                      />
                      <Button
                        title="PDF"
                        kind="quiet"
                        small
                        onPress={() =>
                          router.push(`/jobs/${job.id}/pdf?token=${r.token}&version=${r.version}`)
                        }
                      />
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/** Mounted once while signed in: sends report requests made offline after each sync. */
export function ReportRequestQueue() {
  useEffect(() => watchReportRequests(), []);
  return null;
}

/**
 * Signatures (spec 5.4 Wrap-Up): a card per signature (the drawing, who signed and when,
 * Remove), then the work authorization, signed on its own screen before the work.
 */
export function Signatures({ job }: { job: Job }) {
  const company = useCompany();
  const { services } = useSession();
  const signatures = useJobSignatures(company.id, job.id);
  const workAuthorization = enabledSignaturePurposes(company.settings).some(
    (p) => p.value === "work_authorization",
  );

  function remove(s: SignatureRecord) {
    confirmDestructive({
      title: `Remove ${s.signer_name}’s signature?`,
      confirm: "Remove Signature",
      onConfirm: () =>
        services.sync.write("signature", s.id, company.id, {
          deleted_at: new Date().toISOString(),
        }),
    });
  }

  return (
    <View style={styles.stack}>
      {signatures.length === 0 ? (
        <T muted>
          None yet. The customer signs at the end of the report: write the draft, then Review with
          Customer.
        </T>
      ) : (
        signatures.map((s) => (
          <Card key={s.id} padding={space["4"]} style={{ gap: 2 }}>
            <SignatureImage signature={s} />
            <T variant="bodyEmphasis">
              {s.signer_name}
              {s.signer_role ? <T muted>{` · ${s.signer_role}`}</T> : null}
            </T>
            <T variant="secondary" muted>
              {`${SIGNATURE_PURPOSE_LABELS[s.purpose] ?? s.purpose} · ${formatSchedule(s.signed_at, new Date(), company.timezone)}`}
            </T>
            <Button
              title="Remove"
              kind="quiet"
              style={{ marginLeft: -space["3"], paddingHorizontal: space["3"] }}
              onPress={() => remove(s)}
            />
          </Card>
        ))
      )}
      {workAuthorization ? (
        <Button
          title="Hand to Customer to Sign"
          kind="secondary"
          onPress={() => router.push(`/jobs/${job.id}/signature`)}
        />
      ) : null}
    </View>
  );
}

/**
 * The signature's drawing, 80 tall on paper: this phone's copy when it signed here,
 * otherwise the uploaded file.
 */
function SignatureImage({ signature }: { signature: SignatureRecord }) {
  const [xml, setXml] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const local = new File(Paths.document, `media/signature-${signature.id}.svg`);
        if (local.exists) {
          const text = await local.text();
          if (alive) setXml(text);
          return;
        }
      } catch {
        // Not on this phone.
      }
      if (!signature.image_path) return;
      try {
        const { data } = await getServices()
          .supabase.storage.from("media")
          .createSignedUrl(signature.image_path, 3600);
        if (!data) return;
        const res = await fetch(data.signedUrl);
        if (res.ok && alive) setXml(await res.text());
      } catch {
        // Offline: the name and date still show.
      }
    })();
    return () => {
      alive = false;
    };
  }, [signature.id, signature.image_path]);
  if (!xml) return null;
  return (
    <View
      style={[styles.signature, { backgroundColor: color.paper }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Signature of ${signature.signer_name}`}
    >
      <SvgXml xml={xml} width="100%" height="100%" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space["3"] },
  stack: { gap: space["3"] },
  part: { gap: 2 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space["3"] },
  titleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: space["3"],
  },
  titleLinks: { flexDirection: "row", flexWrap: "wrap", columnGap: space["3"] },
  disclosure: { minHeight: minTap, flexDirection: "row", alignItems: "center", gap: space["2"] },
  link: { minHeight: minTap, flexDirection: "row", alignItems: "center", gap: 4 },
  linkText: { ...face.semiBold, fontSize: 17, lineHeight: 22 },
  divider: { height: StyleSheet.hairlineWidth, marginTop: space["2"] },
  version: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: space["3"],
    paddingVertical: space["1"],
  },
  versionLinks: { flexDirection: "row", gap: space["1"], marginLeft: -space["3"] },
  signature: { height: 80, borderRadius: 4, overflow: "hidden", marginBottom: space["2"] },
});
