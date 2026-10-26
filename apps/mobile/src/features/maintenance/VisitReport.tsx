import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { dateFormat, visitReportMode, type Customer, type Job } from "@leakbook/core";
import { call, reportsOnline, useJobReports } from "../../data/reports";
import { useLine } from "../../data/texting";
import { API_URL } from "../../lib/config";
import { getServices } from "../../lib/services";
import { watchVisitReports, type VisitSendResult } from "../../lib/visitReports";
import { useCompany } from "../../state/session";
import { Button, Card, Field, Notice, T } from "../../ui/components";
import { haptic } from "../../ui/haptics";
import { space } from "../../ui/theme";
import { shareLink } from "../../lib/shareLink";
import { ReportPhotoNotice, useReportPhotoBlock } from "./ReportPhoto";

// A maintenance visit's report (owner, 2026-10-20: "build a report with the tested chemicals,
// checklist, cleanings, photos, etc. Then have an option to send the report to customers"),
// as the website's VisitReportPanel: what went to the customer, and sending it by hand. Each
// send freezes a new version at a customer link. Hidden when the shop turned them off.

/** Mounted once while signed in: sends queued automatic visit reports after each sync. */
export function VisitReportQueue() {
  useEffect(() => watchVisitReports(), []);
  return null;
}

export function VisitReport({
  job,
  customer,
  heading = true,
}: {
  job: Job;
  customer: Customer | undefined;
  /** "Visit Report" above the card; the Next Step bar's sheet has it as its title instead. */
  heading?: boolean;
}) {
  const company = useCompany();
  const mode = visitReportMode(company.settings);
  const line = useLine(company.id);
  const hasLine = line?.status === "active";
  const reports = useJobReports(company.id, job.id);
  const versions = useMemo(
    () => reports.filter((r) => r.template_key === "maintenance"),
    [reports],
  );
  const latest = versions.find((v) => v.status === "sent");
  const [to, setTo] = useState<string | null>(null);
  const email = (to ?? customer?.email ?? "").trim();
  const [busy, setBusy] = useState<"email" | "text" | null>(null);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  // Require a Photo (owner, 2026-10-25): why it can't be sent yet, with Add Photo.
  const photoBlock = useReportPhotoBlock(job.id);
  if (mode === "off") return null;

  const when = (iso: string | null) =>
    iso
      ? dateFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: company.timezone,
        }).format(new Date(iso))
      : "";
  const status = latest
    ? `Sent ${when(latest.sent_at)}${latest.version > 1 ? ` · version ${latest.version}` : ""}.`
    : mode === "auto"
      ? job.status === "done"
        ? "Sending to the customer now."
        : "Goes to the customer by itself when this visit is completed."
      : "The water test, the checklist and cleanings, and photos from this visit.";

  async function send(channel: "email" | "text" | "sms_device") {
    setBusy(channel === "email" ? "email" : "text");
    setResult(null);
    try {
      // The visit's latest work goes up first, so the report carries it.
      await getServices().sync.syncNow();
      const sent = await call<VisitSendResult>(`/api/jobs/${job.id}/visit-report`, {
        channel,
        to: channel === "email" ? email : null,
      });
      if ("skipped" in sent) throw new Error("The visit report wasn’t sent.");
      await getServices().sync.syncNow();
      haptic("reportSent");
      if (!sent.delivered) {
        await shareLink(sent.message);
        setResult({ tone: "success", text: "Visit report ready. Text the customer the link." });
      } else
        setResult({
          tone: "success",
          text: sent.delivered === "email" ? "Visit report emailed." : "Visit report texted.",
        });
    } catch (e) {
      setResult({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  const open = (token: string) => void WebBrowser.openBrowserAsync(`${API_URL}/r/${token}`);
  return (
    <View style={styles.part}>
      {heading ? <T variant="sectionHeading">Visit Report</T> : null}
      <Card style={styles.card}>
        <T variant="secondary" muted>
          {status}
        </T>
        {latest?.token && API_URL ? (
          <Button
            title="View Visit Report"
            kind="quiet"
            style={styles.quiet}
            onPress={() => open(latest.token!)}
          />
        ) : null}
        {!reportsOnline ? (
          <Notice tone="warning">
            This app isn’t connected to the Sundeck Pro server, so visit reports can’t be sent here.
            Use the office website.
          </Notice>
        ) : photoBlock ? (
          <ReportPhotoNotice jobId={job.id} />
        ) : (
          <>
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
            <View style={styles.row}>
              <Button
                title={
                  busy === "email" ? "Sending…" : latest ? "Send Again by Email" : "Send by Email"
                }
                disabled={busy !== null || !email}
                onPress={() => void send("email")}
              />
              <Button
                title={busy === "text" ? "Sending…" : hasLine ? "Send by Text" : "Get Link to Text"}
                kind="secondary"
                disabled={busy !== null}
                onPress={() => void send(hasLine ? "text" : "sms_device")}
              />
            </View>
          </>
        )}
        {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}
        {versions.length > 1 ? (
          <View>
            {versions.map((v) => (
              <View key={v.id} style={styles.version}>
                <T variant="secondary" muted style={{ flexShrink: 1 }}>
                  {`Version ${v.version} · ${when(v.sent_at)}${v.status === "sent" ? " · latest" : ""}`}
                </T>
                {v.token && API_URL ? (
                  <Button title="View" kind="quiet" small onPress={() => open(v.token!)} />
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  part: { gap: space["3"] },
  card: { gap: space["3"] },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space["3"] },
  quiet: { alignSelf: "flex-start", marginLeft: -space["3"], paddingHorizontal: space["3"] },
  version: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space["3"],
  },
});
