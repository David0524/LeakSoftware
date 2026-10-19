import { router } from "expo-router";
import { File, Paths } from "expo-file-system";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Linking, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import {
  SIGNATURE_PURPOSE_LABELS,
  enabledSignaturePurposes,
  formatSchedule,
  splitEmails,
  type Customer,
  type FinalSection,
  type Job,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useRows } from "../../data/hooks";
import {
  finishReportFromPhone,
  reportsOnline,
  sendReportFromPhone,
  useJobReports,
  useJobSignatures,
  writeReportDraft,
  type SignatureRecord,
} from "../../data/reports";
import { API_URL } from "../../lib/config";
import { getServices } from "../../lib/services";
import { useCompany, useSession } from "../../state/session";
import { Button, Card, Field, Notice, T } from "../../ui/components";
import { confirmDestructive } from "../../ui/confirm";
import { color, face, MAX_TEXT_SCALE, minTap, space } from "../../ui/theme";
import { WebIcon } from "../../ui/WebIcon";
import { FinishPhotoNotice, useNeedsFinishPhoto } from "../media/FinishPhoto";

type Template = "homeowner" | "partner";

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

/**
 * Report and Sign-Off (spec 5.4 Wrap-Up): the homeowner report's card. Write Draft, the draft
 * to read and edit (folded once written), Review with Customer, sending without a signature,
 * the finished version to send, and the versions sent.
 */
export function ReportTab({ job, customer }: { job: Job; customer: Customer | undefined }) {
  const company = useCompany();
  const { services } = useSession();
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

  const [open, setOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<"draft" | "email" | "text" | "finish" | null>(null);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [sendStatus, setSendStatus] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );
  const [to, setTo] = useState<string | null>(null);
  const email = (to ?? customer?.email ?? "").trim();
  const [otherEmails, setOtherEmails] = useState<string | null>(null);
  // Finishing a draft (Finish Report, or sending it) waits for a photo when the shop requires
  // one (owner setting, 2026-10-19). A finished version is sent as is, as on the website.
  const needsPhoto = useNeedsFinishPhoto(job.id);
  const [photoAsked, setPhotoAsked] = useState<"finish" | "send" | null>(null);

  if (templateRow?.enabled === false) return null;

  const hasDraft = Boolean(draft?.final_sections);
  const sections = draft?.final_sections ?? [];
  const problems = draft?.ai_draft?.problems ?? [];

  /** Other emails are saved on the customer, so later reports and quotes use them too. */
  function saveOtherEmails() {
    if (!customer || otherEmails === null) return;
    const next = splitEmails(otherEmails);
    if (next.join(" ") !== (customer.cc_emails ?? []).join(" "))
      services.sync.write("customer", customer.id, company.id, { cc_emails: next });
    setOtherEmails(null);
  }

  /** Saves every pending edit in one write, so no edit overwrites another. */
  function saveEdits(): boolean {
    if (!draft || Object.keys(edits).length === 0) return false;
    const next: FinalSection[] = sections.map((s) =>
      edits[s.key] === undefined ? s : { ...s, text: edits[s.key]!.trim() },
    );
    services.sync.write("report", draft.id, company.id, {
      final_sections: next as unknown as JsonValue,
    });
    setEdits({});
    return true;
  }

  /** Writing again replaces the draft's text, so ask first when there is text to lose. */
  function writeDraft() {
    if (!hasDraft) return void run("draft");
    confirmDestructive({
      title: "Write the draft again?",
      message: "The new draft replaces this one, including your edits.",
      confirm: "Replace Draft",
      onConfirm: () => void run("draft"),
    });
  }

  async function run(kind: "draft" | "email" | "text" | "finish", reportId = draft?.id) {
    setBusy(kind);
    const sending = kind === "email" || kind === "text";
    (sending ? setSendStatus : setStatus)(null);
    setPhotoAsked(null);
    if (needsPhoto && (kind === "finish" || (sending && reportId === draft?.id))) {
      setBusy(null);
      return setPhotoAsked(sending ? "send" : "finish");
    }
    try {
      if (kind === "draft") {
        const r = await writeReportDraft(job.id, template);
        setEdits({});
        setOpen(true);
        setStatus({
          tone: "success",
          text: r.problems.length
            ? `Draft written. ${r.problems.length} thing${r.problems.length === 1 ? "" : "s"} to check below.`
            : "Draft written. Read it over and edit anything before sending.",
        });
      } else if (kind === "finish") {
        saveEdits();
        await finishReportFromPhone(reportId!, false);
        setStatus({ tone: "success", text: "Report finished. Send it to the customer below." });
      } else {
        saveEdits();
        saveOtherEmails();
        if (kind === "email" && !/^\S+@\S+\.\S+$/.test(email))
          throw new Error("Enter the customer’s email.");
        const r = await sendReportFromPhone(
          reportId!,
          kind === "email" ? "email" : "sms_device",
          kind === "email" ? email : (customer?.phone ?? null),
        );
        if (kind === "text") {
          await Share.share({ message: r.message });
          setSendStatus({ tone: "success", text: "Report sent." });
        } else setSendStatus({ tone: "success", text: `Sent to ${email}.` });
      }
    } catch (e) {
      (sending ? setSendStatus : setStatus)({
        tone: "error",
        text: e instanceof Error ? e.message : String(e),
      });
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
          onPress={() => void run("email", reportId)}
        />
        <Button
          title="Send by Text"
          kind="secondary"
          disabled={busy !== null || !reportsOnline}
          onPress={() => void run("text", reportId)}
        />
      </View>
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
          {templateRow?.name ?? "Homeowner report"}
        </T>
        <View style={styles.titleLinks}>
          {hasDraft ? (
            <LinkButton
              title={open ? "Hide Draft" : "Show Draft"}
              onPress={() => setOpen(!open)}
              trailing={
                <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
                  <WebIcon name="chevronDown" size={20} color={color.link} strokeWidth={2} />
                </View>
              }
            />
          ) : null}
          {finished?.token && API_URL ? (
            <LinkButton
              title={`View version ${finished.version}`}
              underline
              onPress={() => void Linking.openURL(`${API_URL}/r/${finished.token}`)}
            />
          ) : null}
        </View>
      </View>

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
          onPress={() => router.push(`/jobs/${job.id}/review?template=${template}`)}
        />
      ) : null}
      {status ? <Notice tone={status.tone}>{status.text}</Notice> : null}
      {photoAsked === "finish" && needsPhoto ? <FinishPhotoNotice jobId={job.id} /> : null}

      {hasDraft && draft && open ? (
        <View style={styles.stack}>
          {problems.length ? (
            <Notice tone="warning">
              <T variant="bodyEmphasis">Check these before sending:</T>
              {problems.map((p, i) => (
                <T key={i}>{`•  ${p.message}`}</T>
              ))}
            </Notice>
          ) : null}
          {sections.map((s) => (
            <Field
              key={`${draft.id}-${s.key}`}
              label={s.title}
              value={edits[s.key] ?? s.text}
              onChangeText={(v) => {
                setSaved(false);
                setEdits((e) => ({ ...e, [s.key]: v }));
              }}
              multiline
            />
          ))}
          <View style={styles.row}>
            <Button
              title="Save Text"
              kind="secondary"
              onPress={() => {
                saveEdits();
                setSaved(true);
              }}
            />
            {saved ? (
              <T variant="secondary" style={{ color: color.pass }}>
                Saved.
              </T>
            ) : null}
          </View>

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
            <Button
              title="Review with Customer"
              disabled={busy !== null}
              onPress={() => {
                saveEdits();
                router.push(`/jobs/${job.id}/review?template=${template}`);
              }}
            />
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
      {hasDraft && draft && !open ? (
        <T variant="secondary" muted>
          {`Draft version ${draft.version} is ready to read, edit, and review with the customer.`}
        </T>
      ) : null}
      {sendStatus && !finished ? <Notice tone={sendStatus.tone}>{sendStatus.text}</Notice> : null}
      {photoAsked === "send" && needsPhoto ? <FinishPhotoNotice jobId={job.id} /> : null}

      {finished ? (
        <View style={styles.stack}>
          <Divider />
          <View style={styles.part}>
            <T variant="bodyMedium">{`Version ${finished.version} is finished`}</T>
            <T variant="secondary" muted>
              Send it to the customer, or download the PDF.
            </T>
          </View>
          {sendControls(finished.id, !hasDraft)}
          {sendStatus ? <Notice tone={sendStatus.tone}>{sendStatus.text}</Notice> : null}
          {finished.token && API_URL ? (
            <Button
              title="Download PDF"
              kind="quiet"
              style={{ marginLeft: -space["3"], paddingHorizontal: space["3"] }}
              onPress={() => void Linking.openURL(`${API_URL}/r/${finished.token}/pdf`)}
            />
          ) : null}
        </View>
      ) : null}

      {sent.length ? (
        <View style={styles.stack}>
          <Divider />
          <T variant="bodyMedium">Versions</T>
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
                      onPress={() => void Linking.openURL(`${API_URL}/r/${r.token}`)}
                    />
                    <Button
                      title="PDF"
                      kind="quiet"
                      small
                      onPress={() => void Linking.openURL(`${API_URL}/r/${r.token}/pdf`)}
                    />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </Card>
  );
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
