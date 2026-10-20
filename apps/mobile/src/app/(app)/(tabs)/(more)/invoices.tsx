import { router } from "expo-router";
import {
  INVOICE_STATUS_LABELS,
  dateFormat,
  formatCents,
  invoiceBalance,
  isManagerRole,
} from "@leakbook/core";
import { Alert, Animated, RefreshControl, StyleSheet, View } from "react-native";
import { useRows, useSyncRefresh } from "../../../../data/hooks";
import {
  invoicesCsv,
  paymentsCsv,
  shareCsv,
  useInvoiceList,
  type PaymentRow,
} from "../../../../data/invoice-list";
import { useJobViews } from "../../../../data/jobs";
import { FlatGroupedRow } from "../../../../features/more/FlatGroupedRow";
import { useCompany, useSession } from "../../../../state/session";
import { Button, Empty, T, useScreenChrome } from "../../../../ui/components";
import { ScreenTip } from "../../../../ui/Tip";
import { color, space, tabular } from "../../../../ui/theme";

/**
 * Invoices (spec 5.10): what's owed, then every invoice newest first. A row opens its job's
 * Wrap-Up at the invoice. Managers export invoices or payments as a CSV file to share.
 */
export default function Invoices() {
  const company = useCompany();
  const { membership } = useSession();
  const manager = isManagerRole(membership?.role);
  const jobs = useJobViews(company.id);
  const invoices = useInvoiceList(company.id, jobs);
  const payments = useRows<PaymentRow>("payment", company.id);
  const quotes = useRows<{ id: string; number?: number | null }>("quote", company.id);
  const open = invoices.filter((i) => i.status === "sent" || i.status === "partially_paid");
  const owed = open.reduce((sum, i) => sum + invoiceBalance(i), 0);
  const tz = company.timezone;
  const monthLabel = (month: string) =>
    dateFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${month.slice(0, 10)}T12:00:00Z`),
    );
  const day = (iso: string) =>
    dateFormat("en-US", { dateStyle: "medium", timeZone: tz }).format(
      new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso),
    );

  async function exportCsv(kind: "invoices" | "payments") {
    try {
      const csv =
        kind === "invoices"
          ? invoicesCsv(invoices)
          : paymentsCsv(
              payments,
              new Map(invoices.map((i) => [i.id, i.number])),
              new Map(quotes.map((q) => [q.id, q.number])),
            );
      await shareCsv(kind, csv);
    } catch (e) {
      Alert.alert("Couldn’t Export", e instanceof Error ? e.message : String(e));
    }
  }

  const { header, ref, scrollProps, contentContainerStyle } = useScreenChrome({
    title: "Invoices",
    subtitle: open.length
      ? `${open.length} open · ${formatCents(owed)} owed`
      : "Nothing owed right now.",
    headerActions: manager ? (
      <View style={styles.exports}>
        <Button
          kind="secondary"
          title="Export Invoices"
          onPress={() => void exportCsv("invoices")}
        />
        <Button
          kind="secondary"
          title="Export Payments"
          onPress={() => void exportCsv("payments")}
        />
      </View>
    ) : undefined,
  });

  const pull = useSyncRefresh();
  return (
    <Animated.FlatList
      ref={ref as never}
      {...scrollProps}
      style={{ backgroundColor: color.bg }}
      contentContainerStyle={contentContainerStyle}
      data={invoices}
      refreshControl={<RefreshControl {...pull} />}
      keyExtractor={(i) => i.id}
      initialNumToRender={20}
      ListHeaderComponent={
        <View style={styles.top}>
          {header}
          <ScreenTip screen="invoices" />
        </View>
      }
      ListEmptyComponent={
        <Empty>No invoices yet. Create one from a job once the work is done.</Empty>
      }
      renderItem={({ item: i, index }) => (
        <FlatGroupedRow
          first={index === 0}
          last={index === invoices.length - 1}
          onPress={() => router.push(`/jobs/${i.job_id}?section=wrapup`)}
          value={
            <T variant="bodyEmphasis" style={tabular}>
              {formatCents(i.total_cents)}
            </T>
          }
        >
          <T variant="bodyEmphasis">{i.customer ?? "Customer"}</T>
          <T variant="secondary" muted>
            #{i.number}
            {i.period_month
              ? ` · Maintenance, ${monthLabel(i.period_month)}`
              : i.jobNumber
                ? ` · Job #${i.jobNumber}`
                : ""}
          </T>
          <T variant="secondary" muted>
            {INVOICE_STATUS_LABELS[i.status]}
            {i.sent_at ? ` · sent ${day(i.sent_at)}` : ""}
            {i.status === "sent" || i.status === "partially_paid"
              ? ` · ${formatCents(invoiceBalance(i))} due`
              : ""}
          </T>
        </FlatGroupedRow>
      )}
    />
  );
}

const styles = StyleSheet.create({
  top: { gap: space["5"], marginBottom: space["5"] },
  exports: { flexDirection: "row", flexWrap: "wrap", gap: space["2"] },
});
