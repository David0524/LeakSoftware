import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import {
  SAMPLE_TEXT,
  formatSchedule,
  reportTitle,
  textOnBrand,
  type FinalSection,
  type Job,
  type ReportSnapshot,
} from "@leakbook/core";
import { tokens } from "@leakbook/tokens";
import { useJobRows } from "../../data/hooks";
import { deleteSample, sendSampleToSelf } from "../../data/sample";
import { API_URL } from "../../lib/config";
import { getServices } from "../../lib/services";
import { useCompany, useSession } from "../../state/session";
import { Button, Card, Notice, SamplePill, Screen, T } from "../../ui/components";
import { confirmDestructive } from "../../ui/confirm";
import { color, radius, space } from "../../ui/theme";

// The sample job's page (owner, 2026-10-22: "open it to a finished report with their own logo,
// then prompt 'Send yourself this report'"; docs/design/2026-10-22-first-win.md). As the
// website: the card with Send Yourself This Report, View Report and Delete Sample, then the
// finished report with the shop's own name and logo, which follow Settings.

interface SampleReport {
  id: string;
  status: string;
  version: number;
  final_sections: FinalSection[] | null;
  data_snapshot: ReportSnapshot | null;
  deleted_at?: string | null;
}

interface Link {
  token: string;
  report_id: string | null;
  revoked_at: string | null;
}

export function SampleJob({ job, customer }: { job: Job; customer: string }) {
  const company = useCompany();
  const { user } = useSession();
  const reports = useJobRows<SampleReport>("report", company.id, job.id);
  const links = useJobRows<Link>("share_link", company.id, job.id);
  const report = useMemo(
    () =>
      reports
        .filter((r) => r.status === "sent" && !r.deleted_at)
        .sort((a, b) => b.version - a.version)[0],
    [reports],
  );
  const token = links.find((l) => l.report_id === report?.id && !l.revoked_at)?.token ?? null;
  const shop = report?.data_snapshot?.company;
  const logoPath = shop?.logo_path ?? null;
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!logoPath) return;
    void getServices()
      .supabase.storage.from("company-assets")
      .createSignedUrl(logoPath, 3600)
      .then(({ data }) => setLogoUrl(data?.signedUrl ?? null))
      .catch(() => {});
  }, [logoPath]);

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ text: string; link: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const reportUrl = token && API_URL ? `${API_URL}/r/${token}` : null;
  const brand = shop?.brand_primary ?? company.brand_primary;
  const onBrand = textOnBrand(brand, tokens.color.brand.navy, tokens.color.brand.paper);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const r = await sendSampleToSelf(job.id);
      setSent(
        r.emailed
          ? { text: r.message, link: null }
          : { text: `${r.message} Here’s the report instead.`, link: r.link },
      );
      if (!r.emailed) void WebBrowser.openBrowserAsync(r.link);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  function remove() {
    confirmDestructive({
      title: SAMPLE_TEXT.deleteTitle,
      message: SAMPLE_TEXT.deleteMessage,
      confirm: SAMPLE_TEXT.delete,
      onConfirm: () => {
        setDeleting(true);
        void deleteSample(job.id)
          .then(() => router.navigate("/"))
          .catch((e: unknown) => {
            setError(e instanceof Error ? e.message : String(e));
            setDeleting(false);
          });
      },
    });
  }

  return (
    <Screen
      title={customer}
      subtitle={
        <View style={styles.subtitle}>
          <SamplePill />
          <T variant="secondary" muted>
            {formatSchedule(job.scheduled_start ?? null, new Date(), company.timezone)}
          </T>
        </View>
      }
    >
      <Card>
        <T variant="cardTitle">{SAMPLE_TEXT.title}</T>
        <T style={styles.gap}>{SAMPLE_TEXT.body}</T>
        {logoPath ? null : (
          <T variant="secondary" muted style={styles.gap}>
            {SAMPLE_TEXT.addLogo}
          </T>
        )}
        <View style={styles.buttons}>
          <Button
            title={sending ? SAMPLE_TEXT.sending : SAMPLE_TEXT.send}
            loading={sending}
            wide
            onPress={() => void send()}
          />
          {reportUrl ? (
            <Button
              title={SAMPLE_TEXT.view}
              kind="secondary"
              wide
              onPress={() => void WebBrowser.openBrowserAsync(reportUrl)}
            />
          ) : null}
          {logoPath ? null : (
            <Button
              title={SAMPLE_TEXT.addLogoLink}
              kind="quiet"
              wide
              onPress={() => router.push("/settings/company" as never)}
            />
          )}
        </View>
        {user?.email ? (
          <T variant="secondary" muted style={styles.gap}>
            {`It goes to ${user.email}, and only you.`}
          </T>
        ) : null}
        {sent ? (
          <View style={styles.gap}>
            <Notice tone={sent.link ? "warning" : "success"}>{sent.text}</Notice>
          </View>
        ) : null}
        {error ? (
          <View style={styles.gap}>
            <Notice tone="error">{error}</Notice>
          </View>
        ) : null}
      </Card>

      {report ? (
        <Card padding={0} style={{ overflow: "hidden" }}>
          <View style={[styles.reportHead, { backgroundColor: brand }]}>
            {logoPath && logoUrl ? (
              <Image
                source={{ uri: logoUrl }}
                style={styles.logo}
                resizeMode="contain"
                accessibilityLabel={`${shop?.name ?? company.name} logo`}
              />
            ) : null}
            <T variant="cardTitle" style={{ color: onBrand }}>
              {shop?.name ?? company.name}
            </T>
            <T variant="secondary" style={{ color: onBrand }}>
              {reportTitle(job.type)}
            </T>
          </View>
          <View style={styles.reportBody}>
            <Notice tone="warning">{SAMPLE_TEXT.reportBanner}</Notice>
            {(report.final_sections ?? []).map((s) => (
              <View key={s.key} style={styles.section}>
                <T variant="subHeading">{s.title}</T>
                <T>{s.text}</T>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Button title={SAMPLE_TEXT.delete} kind="danger" wide loading={deleting} onPress={remove} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  gap: { marginTop: space["2"] },
  buttons: { marginTop: space["4"], gap: space["2"] },
  reportHead: { padding: space["5"], gap: space["1"] },
  logo: {
    width: 160,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    marginBottom: space["2"],
  },
  reportBody: { padding: space["5"], gap: space["4"] },
  section: { gap: space["1"] },
});
