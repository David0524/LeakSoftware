import { router } from "expo-router";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Linking, Pressable, Share, View, type TextInput, type ViewStyle } from "react-native";
import {
  SIGNATURE_PURPOSE_LABELS,
  enabledSignaturePurposes,
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
} from "../../data/reports";
import { API_URL } from "../../lib/config";
import { useCompany, useSession } from "../../state/session";
import {
  Block,
  Button,
  FieldGroup,
  FieldRow,
  Group,
  ListRow,
  Notice,
  Row,
  Segmented,
  T,
} from "../../ui/components";
import { color, ios, space } from "../../ui/theme";
import { confirmDestructive } from "../../ui/confirm";
import { ScreenTip } from "../../ui/Tip";

/** Send by Email and Send by Text share one row (Android). */
const halfButton: ViewStyle = { flex: 1, paddingHorizontal: space["2"] };

/** On iPhone, text outside grouped blocks lines up with the rows' text. */
const inset = ios ? { paddingHorizontal: space["4"] } : null;

/**
 * Send by Email and Send by Text: full-width and stacked on iPhone, so the labels never
 * squeeze at large text sizes; side by side on Android, as before.
 */
function SendButtons({ children }: { children: ReactNode }) {
  return ios ? <>{children}</> : <Row style={{ gap: space["2"] }}>{children}</Row>;
}

type Template = "homeowner" | "partner";

/** The server's model name for a draft written without AI (apps/web/src/server/narrative.ts). */

interface TemplateRow {
  key: string;
  name: string;
  enabled: boolean;
}

/** Signatures, then write, edit, and send the report (BUILD_PLAN 6.2 to 6.5). */
export function ReportTab({ job, customer }: { job: Job; customer: Customer | undefined }) {
  const company = useCompany();
  const { services } = useSession();
  const signatures = useJobSignatures(company.id, job.id);
  const reports = useJobReports(company.id, job.id);
  const templateRows = useRows<TemplateRow>("report_template", company.id);
  const templates = useMemo(() => {
    const names = new Map(templateRows.map((t) => [t.key, t]));
    // The homeowner report only (owner, 2026-10-18: "Partner report should be gone").
    return (["homeowner"] as Template[])
      .filter((k) => names.get(k)?.enabled !== false)
      .map((k) => ({
        value: k,
        label: k === "homeowner" ? "Homeowner" : "Partner",
        name: names.get(k)?.name,
      }));
  }, [templateRows]);
  const [template, setTemplate] = useState<Template>("homeowner");
  const draft = reports.find((r) => r.template_key === template && r.status === "draft");
  const sent = reports.filter((r) => r.template_key === template && r.status !== "draft");
  const finished = sent.find((r) => r.status === "sent");
  // Signed on this phone but not yet part of a finished version (signed offline).
  const waiting = signatures.filter((s) => !s.report_id && s.purpose !== "quote_acceptance");
  const ownSheet = enabledSignaturePurposes(company.settings).some(
    (p) => p.value === "work_authorization",
  );

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"draft" | "email" | "text" | "finish" | null>(null);
  // Where an error shows: next to the button that caused it, so it is on screen.
  const [error, setError] = useState<{ at: "draft" | "send" | "finish"; text: string } | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const email = (to ?? customer?.email ?? "").trim();
  const [otherEmails, setOtherEmails] = useState<string | null>(null);
  const otherRef = useRef<TextInput>(null);

  /** Other emails are saved on the customer, so later reports and quotes use them too. */
  function saveOtherEmails() {
    if (!customer || otherEmails === null) return;
    const next = splitEmails(otherEmails);
    if (next.join(" ") !== (customer.cc_emails ?? []).join(" ")) {
      services.sync.write("customer", customer.id, company.id, { cc_emails: next });
    }
    setOtherEmails(null);
  }

  const sections = draft?.final_sections ?? [];
  const problems = draft?.ai_draft?.problems ?? [];

  /** Saves every pending edit in one write, so no edit overwrites another. */
  function saveEdits() {
    if (!draft || Object.keys(edits).length === 0) return;
    const next: FinalSection[] = sections.map((s) =>
      edits[s.key] === undefined ? s : { ...s, text: edits[s.key]!.trim() },
    );
    services.sync.write("report", draft.id, company.id, {
      final_sections: next as unknown as JsonValue,
    });
    setEdits({});
  }

  /** Removed signatures leave later versions; finished versions keep their own copy. */
  function removeSignature(id: string, name: string) {
    confirmDestructive({
      title: `Remove ${name}’s signature?`,
      message: "Reports already finished keep it; new versions won’t show it.",
      confirm: "Remove",
      onConfirm: () =>
        services.sync.write("signature", id, company.id, {
          deleted_at: new Date().toISOString(),
        }),
    });
  }

  /** Writing again replaces the draft's text, so ask first when there is text to lose. */
  function writeDraft() {
    if (!draft?.final_sections) return void run("draft");
    confirmDestructive({
      title: "Write the draft again?",
      message: "The new draft replaces this one, including your edits.",
      confirm: "Write Again",
      onConfirm: () => void run("draft"),
    });
  }

  async function run(kind: "draft" | "email" | "text" | "finish", reportId = draft?.id) {
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      if (kind === "draft") {
        const r = await writeReportDraft(job.id, template);
        setEdits({});
        setMessage(
          r.problems.length
            ? `Draft written. ${r.problems.length} thing${r.problems.length === 1 ? "" : "s"} to check below.`
            : "Draft written. Read it over and edit anything before sending.",
        );
      } else if (kind === "finish") {
        saveEdits();
        await finishReportFromPhone(reportId!, false);
        setMessage("Report finished. Send it to the customer below.");
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
          setMessage("Report sent.");
        } else {
          setMessage(`Sent to ${email}.`);
        }
      }
    } catch (e) {
      setError({
        at: kind === "draft" ? "draft" : kind === "finish" ? "finish" : "send",
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  }

  // The email fields, shared by sending a draft and sending a finished version. They hold the
  // customer's addresses, so iPhone doesn't offer to fill in the tech's own.
  const sendFields = () => (
    <FieldGroup>
      <FieldRow
        label="Customer email"
        layout="stacked"
        value={to ?? customer?.email ?? ""}
        onChangeText={setTo}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        textContentType="none"
        next={customer ? otherRef : undefined}
      />
      {customer ? (
        <FieldRow
          ref={otherRef}
          label="Other emails (optional)"
          layout="stacked"
          value={otherEmails ?? (customer.cc_emails ?? []).join(" ")}
          onChangeText={setOtherEmails}
          onBlur={saveOtherEmails}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          textContentType="none"
          returnKeyType="done"
          hint="They get the report too. Separate with spaces."
        />
      ) : null}
    </FieldGroup>
  );

  const signButton = ownSheet ? (
    <Pressable
      accessibilityRole="button"
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      style={{ flexShrink: 1, minHeight: ios ? 44 : undefined, justifyContent: "center" }}
      onPress={() => router.push(`/jobs/${job.id}/signature`)}
    >
      <T variant="strong" style={{ color: color.link, textAlign: "right" }}>
        Sign Work Authorization
      </T>
    </Pressable>
  ) : null;
  const signedOn = (s: (typeof signatures)[number]) =>
    `${SIGNATURE_PURPOSE_LABELS[s.purpose] ?? s.purpose} · ${new Date(s.signed_at).toLocaleString()}`;
  const removeButton = (s: (typeof signatures)[number]) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Remove signature of ${s.signer_name}`}
      hitSlop={8}
      style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: ios ? 0 : 8 }}
      onPress={() => removeSignature(s.id, s.signer_name)}
    >
      <T variant={ios ? "body" : "strong"} style={{ color: color.fail }}>
        Remove
      </T>
    </Pressable>
  );
  const noSignatures = (
    <T variant="muted" style={inset}>
      The customer signs at the end of the report: Review with Customer.
    </T>
  );

  return (
    <View style={{ gap: 16 }}>
      {job.type === "detection" ? <ScreenTip screen="report" pkg="leak" /> : null}
      <Block title="Signatures" action={signButton}>
        {ios ? (
          // iPhone: a grouped list; swipe left on a row to remove it, or use its Remove button.
          signatures.length ? (
            <Group>
              {signatures.map((s) => (
                <ListRow
                  key={s.id}
                  title={s.signer_name}
                  subtitle={signedOn(s)}
                  trailing={removeButton(s)}
                  onDelete={() => removeSignature(s.id, s.signer_name)}
                  deleteLabel="Remove"
                />
              ))}
            </Group>
          ) : (
            noSignatures
          )
        ) : (
          <>
            {signatures.map((s) => (
              <Row key={s.id} style={{ justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <T variant="strong">{s.signer_name}</T>
                  <T variant="muted">{signedOn(s)}</T>
                </View>
                {removeButton(s)}
              </Row>
            ))}
            {signatures.length === 0 ? noSignatures : null}
          </>
        )}
      </Block>

      {templates.length > 1 ? (
        <Segmented
          grouped
          label="Report for"
          options={templates}
          value={template}
          onChange={(v) => {
            saveEdits();
            setTemplate(v);
            setEdits({});
            setMessage(null);
            setError(null);
          }}
        />
      ) : null}

      {!reportsOnline ? (
        <Notice tone="warning">
          This app isn’t connected to the Sundeck Pro server, so reports can’t be written here. Use
          the office website.
        </Notice>
      ) : (
        <Button
          title={draft?.final_sections ? "Write the Draft Again" : "Write Draft"}
          kind={draft?.final_sections ? "secondary" : "primary"}
          loading={busy === "draft"}
          disabled={busy !== null}
          onPress={writeDraft}
        />
      )}
      {!draft?.final_sections ? (
        <Button
          title="Review with Customer"
          kind="secondary"
          disabled={busy !== null}
          onPress={() => router.push(`/jobs/${job.id}/review?template=${template}`)}
        />
      ) : null}
      {error?.at === "draft" ? <Notice tone="error">{error.text}</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}

      {draft?.final_sections ? (
        <>
          {problems.length ? (
            <Notice tone="warning">
              {`Check these before sending:\n${problems.map((p) => `• ${p.message}`).join("\n")}`}
            </Notice>
          ) : null}
          {sections.map((s) => (
            // iPhone: the section's title as the header of a full-width text block.
            <FieldGroup key={`${draft.id}-${s.key}`} title={s.title}>
              <FieldRow
                label={s.title}
                value={edits[s.key] ?? s.text}
                onChangeText={(v) => setEdits((e) => ({ ...e, [s.key]: v }))}
                onBlur={saveEdits}
                multiline
              />
            </FieldGroup>
          ))}
          <Block
            title={`Finish version ${draft.version}`}
            note={
              waiting.length
                ? `Signed by ${waiting.map((w) => w.signer_name).join(", ")}. Finish the report to lock this version with the signature.`
                : "Hand the phone to the customer: they read the report and sign at the bottom. Signing locks this version."
            }
          >
            {waiting.length ? (
              <Button
                title="Finish Report"
                loading={busy === "finish"}
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
            {error?.at === "finish" ? <Notice tone="error">{error.text}</Notice> : null}
          </Block>
          <Block title="Send Without a Signature" note="Sending locks this version.">
            {sendFields()}
            <SendButtons>
              <Button
                title="Send by Email"
                kind="secondary"
                style={ios ? undefined : halfButton}
                loading={busy === "email"}
                disabled={busy !== null || !reportsOnline}
                onPress={() => void run("email")}
              />
              <Button
                title="Send by Text"
                kind="secondary"
                style={ios ? undefined : halfButton}
                loading={busy === "text"}
                disabled={busy !== null || !reportsOnline}
                onPress={() => void run("text")}
              />
            </SendButtons>
            {error?.at === "send" && !finished ? <Notice tone="error">{error.text}</Notice> : null}
          </Block>
        </>
      ) : null}

      {finished ? (
        <Block
          title={`Version ${finished.version} is finished`}
          note="Send it to the customer, or open the PDF."
        >
          {sendFields()}
          <SendButtons>
            <Button
              title="Send by Email"
              kind={draft?.final_sections ? "secondary" : "primary"}
              style={ios ? undefined : halfButton}
              loading={busy === "email"}
              disabled={busy !== null || !reportsOnline}
              onPress={() => void run("email", finished.id)}
            />
            <Button
              title="Send by Text"
              kind="secondary"
              style={ios ? undefined : halfButton}
              loading={busy === "text"}
              disabled={busy !== null || !reportsOnline}
              onPress={() => void run("text", finished.id)}
            />
          </SendButtons>
          {finished.token && API_URL ? (
            <Button
              title="Open PDF"
              kind="quiet"
              onPress={() => void Linking.openURL(`${API_URL}/r/${finished.token}/pdf`)}
            />
          ) : null}
          {error?.at === "send" && finished ? <Notice tone="error">{error.text}</Notice> : null}
        </Block>
      ) : null}

      {sent.length ? (
        <Block title="Versions">
          {ios ? (
            // iPhone: a grouped list; a row with a link opens that version.
            <Group>
              {sent.map((r) => {
                const label = `Version ${r.version}${r.sent_at ? ` · ${new Date(r.sent_at).toLocaleDateString()}` : ""}${r.status === "superseded" ? " · replaced" : ""}`;
                const url = r.token && API_URL ? `${API_URL}/r/${r.token}` : null;
                return url ? (
                  <ListRow
                    key={r.id}
                    title={label}
                    accessibilityRole="link"
                    accessibilityLabel={`View version ${r.version}`}
                    chevron={false}
                    trailing={
                      <T variant="body" style={{ color: color.link }}>
                        View
                      </T>
                    }
                    onPress={() => void Linking.openURL(url)}
                  />
                ) : (
                  <ListRow key={r.id} title={label} />
                );
              })}
            </Group>
          ) : (
            sent.map((r) => (
              <Row key={r.id} style={{ justifyContent: "space-between" }}>
                <T variant="small">
                  Version {r.version}
                  {r.sent_at ? ` · ${new Date(r.sent_at).toLocaleDateString()}` : ""}
                  {r.status === "superseded" ? " · replaced" : ""}
                </T>
                {r.token && API_URL ? (
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`View version ${r.version}`}
                    hitSlop={12}
                    style={{ minHeight: 44, justifyContent: "center" }}
                    onPress={() => void Linking.openURL(`${API_URL}/r/${r.token}`)}
                  >
                    <T variant="strong" style={{ color: color.link }}>
                      View
                    </T>
                  </Pressable>
                ) : null}
              </Row>
            ))
          )}
        </Block>
      ) : null}
    </View>
  );
}
