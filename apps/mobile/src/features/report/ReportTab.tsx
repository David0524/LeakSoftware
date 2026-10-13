import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, Pressable, Share, View } from "react-native";
import {
  SIGNATURE_PURPOSE_LABELS,
  type Customer,
  type FinalSection,
  type Job,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useRows } from "../../data/hooks";
import {
  reportsOnline,
  sendReportFromPhone,
  useJobReports,
  useJobSignatures,
  writeReportDraft,
} from "../../data/reports";
import { API_URL } from "../../lib/config";
import { useCompany, useSession } from "../../state/session";
import { Button, Card, Field, Notice, Row, Segmented, T } from "../../ui/components";
import { color } from "../../ui/theme";

type Template = "homeowner" | "partner";

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
    return (["homeowner", "partner"] as Template[])
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

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"draft" | "email" | "text" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const email = (to ?? customer?.email ?? "").trim();

  const sections = draft?.final_sections ?? [];
  const problems = draft?.ai_draft?.problems ?? [];

  function saveSection(key: string) {
    if (!draft || edits[key] === undefined) return;
    const next: FinalSection[] = sections.map((s) =>
      s.key === key ? { ...s, text: edits[key]!.trim() } : s,
    );
    services.sync.write("report", draft.id, company.id, {
      final_sections: next as unknown as JsonValue,
    });
    setEdits(({ [key]: _, ...rest }) => rest);
  }

  async function run(kind: "draft" | "email" | "text") {
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
      } else {
        for (const key of Object.keys(edits)) saveSection(key);
        if (kind === "email" && !/^\S+@\S+\.\S+$/.test(email))
          throw new Error("Enter the customer’s email.");
        const r = await sendReportFromPhone(
          draft!.id,
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
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <T variant="heading">Signatures</T>
        </Row>
        {signatures.length === 0 ? <T variant="muted">No signatures yet.</T> : null}
        {signatures.map((s) => (
          <View key={s.id}>
            <T variant="strong">{s.signer_name}</T>
            <T variant="muted">
              {SIGNATURE_PURPOSE_LABELS[s.purpose] ?? s.purpose} ·{" "}
              {new Date(s.signed_at).toLocaleString()}
            </T>
          </View>
        ))}
        <Button
          title="Add Signature"
          kind="secondary"
          onPress={() => router.push(`/jobs/${job.id}/signature`)}
        />
      </Card>

      {templates.length > 1 ? (
        <Segmented
          label="Report for"
          options={templates}
          value={template}
          onChange={(v) => {
            setTemplate(v);
            setEdits({});
            setMessage(null);
            setError(null);
          }}
        />
      ) : null}

      {!reportsOnline ? (
        <Notice tone="warning">
          This app isn’t connected to the LeakBook server, so reports can’t be written here. Use the
          office website.
        </Notice>
      ) : (
        <Button
          title={draft?.final_sections ? "Write the Draft Again" : "Write Draft"}
          kind={draft?.final_sections ? "secondary" : "primary"}
          loading={busy === "draft"}
          disabled={busy !== null}
          onPress={() => void run("draft")}
        />
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}

      {draft?.final_sections ? (
        <>
          {problems.length ? (
            <Notice tone="warning">
              {`Check these before sending:\n${problems.map((p) => `• ${p.message}`).join("\n")}`}
            </Notice>
          ) : null}
          {sections.map((s) => (
            <Field
              key={`${draft.id}-${s.key}`}
              label={s.title}
              value={edits[s.key] ?? s.text}
              onChangeText={(v) => setEdits((e) => ({ ...e, [s.key]: v }))}
              onBlur={() => saveSection(s.key)}
              multiline
            />
          ))}
          <Card>
            <T variant="heading">Send Version {draft.version}</T>
            <T variant="muted">
              Sending locks this version. Changes after that go out as a new version.
            </T>
            <Field
              label="Customer email"
              value={to ?? customer?.email ?? ""}
              onChangeText={setTo}
              keyboardType="email-address"
              autoCapitalize="none"
              textContentType="emailAddress"
            />
            <Button
              title="Send by Email"
              loading={busy === "email"}
              disabled={busy !== null || !reportsOnline}
              onPress={() => void run("email")}
            />
            <Button
              title="Send by Text"
              kind="secondary"
              loading={busy === "text"}
              disabled={busy !== null || !reportsOnline}
              onPress={() => void run("text")}
            />
          </Card>
        </>
      ) : null}

      {sent.length ? (
        <Card>
          <T variant="heading">Sent</T>
          {sent.map((r) => (
            <Row key={r.id} style={{ justifyContent: "space-between" }}>
              <T variant="small">
                Version {r.version}
                {r.sent_at ? ` · ${new Date(r.sent_at).toLocaleDateString()}` : ""}
                {r.status === "superseded" ? " · replaced" : ""}
              </T>
              {r.token && API_URL ? (
                <Pressable
                  accessibilityRole="link"
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
          ))}
        </Card>
      ) : null}
    </View>
  );
}
