import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert, RefreshControl, StyleSheet, View } from "react-native";
import {
  INVOICE_STATUS_LABELS,
  AUTO_SEND_ON_FOOTER,
  SEND_ALL_FOOTER,
  autoSendFailed,
  sendsMonthlyInvoices,
  billingMonthName,
  dateFormat,
  formatCents,
  invoiceOverdue,
  isManagerRole,
  lineTotal,
  linesSummary,
  monthBillingSubtitle,
  notInvoicedText,
  sendAllConfirm,
  sendAllLabel,
  sendRoute,
  sendRouteLabel,
  type InvoiceStatus,
  type MonthBilling,
  type MonthBillingInvoice,
  type SendAllResult,
} from "@leakbook/core";
import { addInvoiceCharge, removeInvoiceLine, useChargeItems } from "../../../../../data/charges";
import {
  createMonthInvoices,
  loadMonthBilling,
  sendMonthInvoices,
  useLocalMonthBilling,
  validMonth,
} from "../../../../../data/monthlyBilling";
import { useLine } from "../../../../../data/texting";
import { AddChargeRow, AddChargeSheet } from "../../../../../features/charges/Charges";
import { getServices } from "../../../../../lib/services";
import { useCompany, useSession } from "../../../../../state/session";
import {
  Button,
  Card,
  Empty,
  Group,
  ListRow,
  Notice,
  Screen,
  Section,
  Segmented,
  T,
} from "../../../../../ui/components";
import { confirmDestructive } from "../../../../../ui/confirm";
import { haptics } from "../../../../../ui/haptics";
import { ModalSheet } from "../../../../../ui/ModalSheet";
import { color, space, tabular } from "../../../../../ui/theme";

/**
 * A month's Monthly Billing (owner, 2026-11-15; docs/design/2026-11-15-monthly-billing.md), as
 * the website's invoices/month/[month] page: Create Invoices for anyone not invoiced yet, To Send
 * and Sent, a customer's sheet with the draft's lines (Remove), Add Charge and Open Invoice, and
 * Send {n} Invoices, which asks first and sends them all on the server. Owners and admins.
 */
export default function MonthBillingPage() {
  const { month: asked, invoice } = useLocalSearchParams<{ month: string; invoice?: string }>();
  const month = validMonth(asked);
  const { membership } = useSession();
  const title = month ? `${billingMonthName(month, false)} Billing` : "Monthly Billing";
  if (!isManagerRole(membership?.role))
    return (
      <Screen title={title}>
        <Notice>Only owners and admins can bill the month.</Notice>
      </Screen>
    );
  if (!month)
    return (
      <Screen title={title}>
        <Notice tone="warning">This month isn’t one Monthly Billing has.</Notice>
      </Screen>
    );
  return <MonthPage month={month} title={title} openInvoice={invoice ?? null} />;
}

function MonthPage({
  month,
  title,
  openInvoice,
}: {
  month: string;
  title: string;
  openInvoice: string | null;
}) {
  const company = useCompany();
  const line = useLine(company.id);
  const texting = line?.status === "active";
  const items = useChargeItems(company.id);
  const [server, setServer] = useState<MonthBilling | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const billing = useLocalMonthBilling(company.id, server, company.settings.tax_rate_bps ?? 0);
  const [tab, setTab] = useState<"send" | "sent" | null>(null);
  const [open, setOpen] = useState<string | null>(openInvoice);
  const [adding, setAdding] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<SendAllResult | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const live = useRef(true);

  const load = useCallback(async () => {
    try {
      const b = await loadMonthBilling(company.id, month);
      if (!live.current) return;
      setServer(b);
      setLoadError(null);
    } catch (e) {
      if (live.current) setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [company.id, month]);

  useFocusEffect(
    useCallback(() => {
      live.current = true;
      void load();
      return () => {
        live.current = false;
      };
    }, [load]),
  );

  const monthWord = billingMonthName(month, false);
  const drafts = billing?.invoices.filter((i) => i.status === "draft") ?? [];
  const sent = billing?.invoices.filter((i) => i.status !== "draft") ?? [];
  const shownTab = tab ?? (drafts.length || !sent.length ? "send" : "sent");
  const routes = drafts.map((d) => sendRoute(d, texting));
  const sendable = routes.filter((r) => r.channel !== "none").length;
  const failedReason = new Map((result?.failed ?? []).map((f) => [f.id, f.reason]));
  const day = (iso: string) =>
    dateFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
      new Date(`${iso.slice(0, 10)}T12:00:00Z`),
    );
  const today = dateFormat("en-CA", { timeZone: company.timezone }).format(new Date());
  const notInvoiced = billing ? notInvoicedText(billing, day) : null;
  const current = drafts.find((d) => d.id === open) ?? null;
  const addingTo = drafts.find((d) => d.id === adding) ?? null;

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function createInvoices() {
    setNotice(null);
    setCreating(true);
    try {
      const message = await createMonthInvoices(company.id, month);
      setNotice({ tone: "success", text: message });
      haptics.success();
      void getServices()
        .sync.syncNow()
        .catch(() => undefined);
      await load();
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setCreating(false);
    }
  }

  function askToSend() {
    const ask = sendAllConfirm(routes, monthWord);
    Alert.alert(ask.title, ask.message, [
      { text: "Cancel", style: "cancel" },
      { text: "Send", onPress: () => void sendAll() },
    ]);
  }

  async function sendAll() {
    setNotice(null);
    setResult(null);
    setSending(true);
    try {
      const r = await sendMonthInvoices(company.id, month);
      setResult(r);
      if (r.failed.length) haptics.warning();
      else haptics.success();
      // The sent invoices come down to the phone; the page reads the server's again.
      void getServices()
        .sync.syncNow()
        .catch(() => undefined);
      await load();
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen
      title={title}
      subtitle={billing ? monthBillingSubtitle(billing) : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      {result ? (
        <Notice tone={result.failed.length ? "warning" : "success"}>
          <View style={styles.notice}>
            <T>{result.message}</T>
            {result.failed.map((f) => (
              <T key={f.id} variant="secondary">{`• ${f.customer}: ${f.reason}`}</T>
            ))}
          </View>
        </Notice>
      ) : null}
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {loadError && !billing ? <Notice tone="error">{loadError}</Notice> : null}
      {!billing && !loadError ? <T muted>Loading…</T> : null}

      {billing ? (
        <>
          {notInvoiced ? (
            <Card padding={space["4"]} style={{ gap: space["3"] }}>
              <T>{notInvoiced}</T>
              <Button
                title="Create Invoices"
                kind="secondary"
                loading={creating}
                onPress={() => createInvoices()}
              />
            </Card>
          ) : null}

          <Segmented
            accessibilityLabel="Show"
            value={shownTab}
            onChange={setTab}
            options={[
              { value: "send", label: `To Send ${drafts.length}` },
              { value: "sent", label: `Sent ${sent.length}` },
            ]}
          />

          {shownTab === "send" ? (
            drafts.length === 0 ? (
              <Empty>
                {sent.length
                  ? `Every ${monthWord} invoice has been sent.`
                  : `No ${monthWord} invoices yet.`}
              </Empty>
            ) : (
              <>
                <Section title="To Send">
                  <Group>
                    {drafts.map((d, i) => {
                      const route = routes[i]!;
                      const reason = failedReason.get(d.id);
                      return (
                        <ListRow
                          key={d.id}
                          onPress={() => setOpen(d.id)}
                          accessibilityHint="Opens the customer’s invoice"
                          detail={
                            <T variant="bodyEmphasis" style={tabular}>
                              {formatCents(d.total_cents)}
                            </T>
                          }
                        >
                          <T variant="bodyEmphasis">{d.customer}</T>
                          <T variant="secondary" muted numberOfLines={1}>
                            {linesSummary(d.lines)}
                          </T>
                          <T
                            variant="secondary"
                            numberOfLines={1}
                            muted={!(reason || d.auto_send_error || route.channel === "none")}
                            style={
                              reason || d.auto_send_error || route.channel === "none"
                                ? { color: color.warning }
                                : undefined
                            }
                          >
                            {reason ??
                              (d.auto_send_error
                                ? autoSendFailed(d.auto_send_error)
                                : sendRouteLabel(route))}
                          </T>
                        </ListRow>
                      );
                    })}
                  </Group>
                </Section>
                <View style={styles.send}>
                  <Button
                    title={sending ? "Sending…" : sendAllLabel(sendable)}
                    wide
                    disabled={sending || sendable === 0}
                    onPress={askToSend}
                  />
                  <View style={styles.footer}>
                    <T variant="footnote" muted>
                      {SEND_ALL_FOOTER}
                      {sendsMonthlyInvoices(company.settings) ? ` ${AUTO_SEND_ON_FOOTER}` : ""}
                    </T>
                  </View>
                </View>
              </>
            )
          ) : sent.length === 0 ? (
            <Empty>{`Nothing sent for ${monthWord} yet.`}</Empty>
          ) : (
            <Section title="Sent">
              <Group>
                {sent.map((s) => (
                  <ListRow
                    key={s.id}
                    onPress={() => router.push(`/jobs/${s.job_id}?section=wrapup`)}
                    detail={
                      <T muted style={tabular}>
                        {formatCents(s.total_cents)}
                      </T>
                    }
                  >
                    <T variant="bodyEmphasis">{s.customer}</T>
                    <T variant="secondary" muted>{`${s.number ? `#${s.number} · ` : ""}${
                      invoiceOverdue(
                        {
                          status: s.status as InvoiceStatus,
                          due_date: s.due_date,
                          sent_at: s.sent_at,
                        } as Parameters<typeof invoiceOverdue>[0],
                        today,
                      )
                        ? "Overdue"
                        : (INVOICE_STATUS_LABELS[s.status as InvoiceStatus] ?? s.status)
                    }${s.sent_at ? ` · sent ${day(s.sent_at)}` : ""}`}</T>
                  </ListRow>
                ))}
              </Group>
            </Section>
          )}
        </>
      ) : null}

      <ModalSheet
        visible={!!current && !adding}
        onClose={() => setOpen(null)}
        title={current?.customer ?? ""}
        cancel="Done"
      >
        {current ? (
          <CustomerSheet
            invoice={current}
            month={month}
            onAddCharge={() => setAdding(current.id)}
            onOpenInvoice={() => {
              setOpen(null);
              router.push(`/jobs/${current.job_id}?section=wrapup`);
            }}
          />
        ) : null}
      </ModalSheet>
      <AddChargeSheet
        open={!!addingTo}
        items={items}
        onClose={() => setAdding(null)}
        onAdd={(values) => {
          if (addingTo) addInvoiceCharge(company.id, addingTo.id, values);
          setAdding(null);
        }}
      />
    </Screen>
  );
}

/** A customer's draft: its lines (each with Remove), Add Charge, and Open Invoice. */
function CustomerSheet({
  invoice,
  month,
  onAddCharge,
  onOpenInvoice,
}: {
  invoice: MonthBillingInvoice;
  month: string;
  onAddCharge: () => void;
  onOpenInvoice: () => void;
}) {
  const company = useCompany();
  const remove = (id: string, description: string) =>
    confirmDestructive({
      title: `Remove “${description}”?`,
      confirm: "Remove",
      onConfirm: () => removeInvoiceLine(company.id, id),
    });
  return (
    <View style={{ gap: space["5"] }}>
      <T muted>{`${billingMonthName(month, false)} · ${formatCents(invoice.total_cents)}`}</T>
      <Section title="Lines">
        <Group>
          {[
            ...invoice.lines.map((l) => {
              const quantity = Number(l.quantity);
              const removable = l.kind === "item";
              return (
                <ListRow
                  key={l.id}
                  title={l.description}
                  subtitle={
                    quantity !== 1
                      ? `${quantity} ${l.unit ?? ""} × ${formatCents(l.unit_price_cents)}`
                      : undefined
                  }
                  detail={
                    <T muted style={tabular}>
                      {formatCents(lineTotal({ quantity, unit_price_cents: l.unit_price_cents }))}
                    </T>
                  }
                  trailing={
                    removable ? (
                      <Button
                        title="Remove"
                        kind="quiet"
                        small
                        accessibilityLabel={`Remove ${l.description}`}
                        onPress={() => remove(l.id, l.description)}
                      />
                    ) : undefined
                  }
                  onDelete={removable ? () => remove(l.id, l.description) : undefined}
                  deleteLabel="Remove"
                />
              );
            }),
            <AddChargeRow key="add" onPress={onAddCharge} />,
          ]}
        </Group>
      </Section>
      <Button title="Open Invoice" kind="secondary" wide onPress={onOpenInvoice} />
    </View>
  );
}

const styles = StyleSheet.create({
  send: { gap: space["2"] },
  notice: { flex: 1, gap: 4 },
  footer: { paddingHorizontal: space["4"] },
});
