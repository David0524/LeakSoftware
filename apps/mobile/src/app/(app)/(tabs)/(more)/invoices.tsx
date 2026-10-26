import { router, useLocalSearchParams } from "expo-router";
import {
  INVOICE_FILTERS,
  INVOICE_SORTS,
  INVOICE_STATUS_LABELS,
  dateFormat,
  filterInvoices,
  formatCents,
  invoiceBalance,
  invoiceOverdue,
  invoiceShareText,
  isManagerRole,
  latestReceiptPayment,
  receiptSummary,
  friendlyError,
} from "@leakbook/core";
import { useMemo, useState } from "react";
import { Alert, Animated, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRows, useSyncRefresh } from "../../../../data/hooks";
import {
  invoicesCsv,
  paymentsCsv,
  shareCsv,
  useInvoiceList,
  type InvoiceListRow,
  type PaymentRow,
} from "../../../../data/invoice-list";
import { voidInvoice } from "../../../../features/invoice/InvoiceSection";
import { RecordPayment, SendReceiptSheet } from "../../../../features/invoice/Receipt";
import { useLine } from "../../../../data/texting";
import { API_URL } from "../../../../lib/config";
import { invoiceRowActions, menuTitle, type InvoiceActionId } from "../../../../lib/rowActions";
import { confirmDestructive } from "../../../../ui/confirm";
import { ModalSheet } from "../../../../ui/ModalSheet";
import { useResultBanner } from "../../../../ui/ResultBanner";
import { rowGestures, useRowMenu } from "../../../../ui/RowMenu";
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
import { color, face, MAX_TEXT_SCALE, minTap, space, tabular, type } from "../../../../ui/theme";
import { shareLink } from "../../../../lib/shareLink";

/**
 * Invoices (spec 5.10): what's owed, then the invoices, newest first. Filter pills with counts,
 * a search, and a Sort menu narrow and order them (owner, 2026-10-20: "add some filtering and
 * sorting"), with the website's rules (@leakbook/core filterInvoices). A row opens its job's
 * Wrap-Up at the invoice. Managers export invoices or payments as a CSV file to share. Swipe
 * right on an unpaid invoice to Record Payment; touch and hold for Open, Share Payment Link,
 * Record Payment and Void… (gestures spec section 12), each as the invoice's own card does it.
 */
export default function Invoices() {
  const company = useCompany();
  const { membership } = useSession();
  const manager = isManagerRole(membership?.role);
  const jobs = useJobViews(company.id);
  const invoices = useInvoiceList(company.id, jobs);
  const payments = useRows<PaymentRow>("payment", company.id);
  const quotes = useRows<{ id: string; number?: number | null }>("quote", company.id);
  const links = useRows<{ token: string; invoice_id: string | null; revoked_at: string | null }>(
    "share_link",
    company.id,
  );
  const rowMenu = useRowMenu();
  const banner = useResultBanner();
  const [paying, setPaying] = useState<InvoiceListRow | null>(null);
  // Send Receipt (2026-10-22): right after Record Payment (that payment), or the latest.
  const [receipt, setReceipt] = useState<{
    invoice: InvoiceListRow;
    paymentId: string | null;
    status: string | null;
    summary: string;
  } | null>(null);
  const line = useLine(company.id);
  const open = invoices.filter((i) => i.status === "sent" || i.status === "partially_paid");
  const owed = open.reduce((sum, i) => sum + invoiceBalance(i), 0);
  const tz = company.timezone;
  // The shop's today (YYYY-MM-DD), for Overdue.
  const [today] = useState(() => dateFormat("en-CA", { timeZone: tz }).format(new Date()));
  // Opened from the Dashboard's Owed to You (`/invoices?filter=open`).
  const { filter: asked } = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState(() =>
    INVOICE_FILTERS.some((f) => f.key === asked) ? asked! : "all",
  );
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
      Alert.alert("Couldn’t Export", friendlyError(e));
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

  /** The invoice card's own Share Link, Record Payment and Void Invoice. */
  function gesturesFor(i: InvoiceListRow) {
    const token = links.find((l) => l.invoice_id === i.id && !l.revoked_at)?.token;
    const link = token && API_URL ? `${API_URL}/i/${token}` : null;
    const actions = invoiceRowActions({
      status: i.status,
      balanceCents: invoiceBalance(i),
      role: membership?.role,
      hasPayments: payments.some(
        (p) =>
          p.invoice_id === i.id &&
          !p.deleted_at &&
          (p.status === "succeeded" || p.status === "pending"),
      ),
      hasLink: Boolean(link),
      hasReceipt: payments.some(
        (p) => p.invoice_id === i.id && !p.deleted_at && p.status === "succeeded",
      ),
    });
    const name = `Invoice #${i.number ?? ""}`;
    const run = (id: InvoiceActionId) => {
      if (id === "open") router.push(`/jobs/${i.job_id}?section=wrapup`);
      if (id === "share" && link) void shareLink(invoiceShareText(company.name, link));
      if (id === "record") setPaying(i);
      if (id === "receipt") {
        const p = latestReceiptPayment(
          payments.filter((x) => x.invoice_id === i.id && !x.deleted_at),
        );
        setReceipt({
          invoice: i,
          paymentId: null,
          status: null,
          summary: p ? receiptSummary(p, i) : "",
        });
      }
      if (id === "void")
        confirmDestructive({
          title: "Void this invoice? The customer's link will show it as void.",
          confirm: "Void Invoice",
          onConfirm: () =>
            void voidInvoice(i.id)
              .then(() => banner.show({ tone: "success", message: `${name} voided` }))
              .catch((e: unknown) => banner.show({ tone: "error", message: friendlyError(e) })),
        });
    };
    return rowGestures(actions, run, () =>
      rowMenu.open(menuTitle(i.customer, `#${i.number ?? ""}`), actions.menu, run),
    );
  }

  const pull = useSyncRefresh();
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
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
            gestures={gesturesFor(i)}
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
      {rowMenu.element}
      <ModalSheet
        visible={paying != null}
        onClose={() => setPaying(null)}
        title={`Record Payment${paying?.number ? ` · #${paying.number}` : ""}`}
      >
        {paying ? (
          <RecordPayment
            invoice={paying}
            balance={invoiceBalance(paying)}
            onRecorded={(r) => {
              const invoice = paying;
              setPaying(null);
              setReceipt({ invoice, paymentId: r.paymentId, status: r.status, summary: r.summary });
            }}
          />
        ) : null}
      </ModalSheet>
      {receipt ? (
        <SendReceiptSheet
          visible
          invoiceId={receipt.invoice.id}
          paymentId={receipt.paymentId}
          summary={receipt.summary}
          justRecorded={receipt.status}
          contact={(() => {
            const c = jobs.find((j) => j.id === receipt.invoice.job_id)?.customer;
            return {
              email: c?.email ?? null,
              phone: c?.phone ?? null,
              texting: line?.status === "active",
            };
          })()}
          onClose={() => setReceipt(null)}
          onSent={(message) => {
            setReceipt(null);
            banner.show({ tone: "success", message });
          }}
        />
      ) : null}
      {banner.element}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { gap: space["5"], marginBottom: space["5"] },
  tools: { gap: space["3"] },
  searchRow: { flexDirection: "row", alignItems: "center", gap: space["3"] },
  sort: { minHeight: minTap, flexDirection: "row", alignItems: "center", gap: 4 },
  exports: { flexDirection: "row", flexWrap: "wrap", gap: space["2"] },
});
