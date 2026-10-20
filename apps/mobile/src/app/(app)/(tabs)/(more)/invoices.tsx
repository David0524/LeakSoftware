import { router } from "expo-router";
import {
  INVOICE_FILTERS,
  INVOICE_SORTS,
  INVOICE_STATUS_LABELS,
  dateFormat,
  filterInvoices,
  formatCents,
  invoiceBalance,
  invoiceOverdue,
  isManagerRole,
} from "@leakbook/core";
import { useMemo, useState } from "react";
import { Alert, Animated, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
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
import {
  Button,
  Empty,
  FilterPills,
  SearchField,
  T,
  useScreenChrome,
} from "../../../../ui/components";
import { useMenu } from "../../../../ui/Select";
import { WebIcon } from "../../../../ui/WebIcon";
import { ScreenTip } from "../../../../ui/Tip";
import { color, face, MAX_TEXT_SCALE, minTap, space, tabular, type } from "../../../../ui/theme";

/**
 * Invoices (spec 5.10): what's owed, then the invoices, newest first. Filter pills with counts,
 * a search, and a Sort menu narrow and order them (owner, 2026-10-20: "add some filtering and
 * sorting"), with the website's rules (@leakbook/core filterInvoices). A row opens its job's
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
  // The shop's today (YYYY-MM-DD), for Overdue.
  const [today] = useState(() => dateFormat("en-CA", { timeZone: tz }).format(new Date()));
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");
  const q = search.trim();
  const shown = useMemo(
    () => filterInvoices(invoices, { filter, sort, q, today }),
    [invoices, filter, sort, q, today],
  );
  const filters = useMemo(
    () =>
      INVOICE_FILTERS.map((f) => ({
        value: f.key as string,
        label: `${f.label} ${f.key === "all" ? invoices.length : filterInvoices(invoices, { filter: f.key, today }).length}`,
      })),
    [invoices, today],
  );
  const menu = useMenu();
  const sortLabel = INVOICE_SORTS.find((x) => x.key === sort)?.label ?? "Newest";
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
      data={shown}
      refreshControl={<RefreshControl {...pull} />}
      keyExtractor={(i) => i.id}
      initialNumToRender={20}
      ListHeaderComponent={
        <View style={styles.top}>
          {header}
          <ScreenTip screen="invoices" />
          {invoices.length ? (
            <View style={styles.tools}>
              <FilterPills
                label="Filter invoices"
                options={filters}
                value={filter}
                onChange={setFilter}
              />
              <View style={styles.searchRow}>
                <View style={{ flex: 1 }}>
                  <SearchField
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Customer, invoice, or job number"
                    label="Search invoices"
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Sort, ${sortLabel}`}
                  onPress={() =>
                    menu.open({
                      title: "Sort",
                      items: INVOICE_SORTS.map((x) => ({
                        label: x.label,
                        checked: x.key === sort,
                        onPress: () => setSort(x.key),
                      })),
                    })
                  }
                  style={({ pressed }) => [styles.sort, pressed && { opacity: 0.5 }]}
                >
                  <Text
                    style={[type.secondary, face.semiBold, { color: color.link }]}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  >
                    {sortLabel}
                  </Text>
                  <WebIcon name="updown" size={16} color={color.link} strokeWidth={2} />
                </Pressable>
              </View>
            </View>
          ) : null}
          {menu.element}
        </View>
      }
      ListEmptyComponent={
        invoices.length ? (
          <Empty>
            {q ? `No invoices match “${q}”.` : "No invoices here."}{" "}
            <Text
              accessibilityRole="button"
              onPress={() => {
                setFilter("all");
                setSearch("");
              }}
              style={[face.semiBold, { color: color.link }]}
            >
              Show All
            </Text>
          </Empty>
        ) : (
          <Empty>No invoices yet. Create one from a job once the work is done.</Empty>
        )
      }
      renderItem={({ item: i, index }) => (
        <FlatGroupedRow
          first={index === 0}
          last={index === shown.length - 1}
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
            {invoiceOverdue(i, today) ? (
              <T variant="secondary" style={{ color: color.fail }}>
                Overdue
              </T>
            ) : (
              INVOICE_STATUS_LABELS[i.status]
            )}
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
  tools: { gap: space["3"] },
  searchRow: { flexDirection: "row", alignItems: "center", gap: space["3"] },
  sort: { minHeight: minTap, flexDirection: "row", alignItems: "center", gap: 4 },
  exports: { flexDirection: "row", flexWrap: "wrap", gap: space["2"] },
});
