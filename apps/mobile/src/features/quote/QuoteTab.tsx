import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Linking, Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import {
  QUOTE_STATUS_LABELS,
  discountAllowed,
  formatCents,
  isManagerRole,
  lineTotal,
  parseDollars,
  quoteShareText,
  quoteTotals,
  suggestItems,
  type Job,
  type PriceBookItem,
} from "@leakbook/core";
import { useRow, useRows } from "../../data/hooks";
import { useInspectionConfig, useJobInspection } from "../../data/inspection";
import {
  addItem,
  addLine,
  quoteLink,
  removeLine,
  sendQuoteFromPhone,
  setDiscount,
  startQuote,
  updateLine,
  useJobQuotes,
  usePriceBook,
  type JobQuote,
} from "../../data/quotes";
import { reportsOnline } from "../../data/reports";
import { API_URL } from "../../lib/config";
import { getServices } from "../../lib/services";
import { useCompany, useSession } from "../../state/session";
import { Button, Card, Field, Notice, T } from "../../ui/components";
import { confirmDestructive } from "../../ui/confirm";
import { haptics } from "../../ui/haptics";
import { Select } from "../../ui/Select";
import { color, face, MAX_TEXT_SCALE, minTap, shape, space, tabular } from "../../ui/theme";
import { WebIcon } from "../../ui/WebIcon";
import { useUnsavedChanges } from "../../ui/ModalSheet";

const PAYMENT_LABELS: Record<string, string> = {
  pending: "processing",
  succeeded: "paid",
  failed: "failed",
  refunded: "refunded",
};

interface PaymentRow {
  id: string;
  quote_id: string | null;
  amount_cents: number;
  method: string;
  status: string;
}

/**
 * Quotes (spec 5.4 Wrap-Up, 6.4), as on the website: the payments notice for managers, Start
 * Quote when there's no draft or accepted quote, then a card per quote. A draft's card holds
 * the builder (from findings, the price book, custom lines, the discount, totals) and Send
 * Quote; a sent one its lines, deposit, customer link and acceptance. Drafts work offline.
 */
export function QuoteTab({ job }: { job: Job }) {
  const company = useCompany();
  const { services, membership } = useSession();
  const quotes = useJobQuotes(company.id, job.id);
  const manager = isManagerRole(membership?.role);
  const [paymentsReady, setPaymentsReady] = useState<boolean | null>(null);
  const anySent = quotes.some((q) => q.status !== "draft");

  useEffect(() => {
    if (!manager || !anySent) return;
    let alive = true;
    void Promise.resolve(
      getServices()
        .supabase.from("stripe_account")
        .select("charges_enabled")
        .eq("company_id", company.id)
        .maybeSingle(),
    )
      .then(({ data }) => {
        if (alive)
          setPaymentsReady(
            Boolean((data as { charges_enabled?: boolean } | null)?.charges_enabled),
          );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [manager, anySent, company.id]);

  const hasDraft = quotes.some((q) => q.status === "draft");
  const hasAccepted = quotes.some((q) => q.status === "accepted");

  return (
    <View style={styles.stack}>
      {manager && anySent && paymentsReady === false ? (
        <Notice tone="warning">
          <T>
            Customers can accept quotes but can’t pay deposits online until payments are set up.{" "}
            {API_URL ? (
              // Payments are set up on the website (spec 10.4).
              <Text
                accessibilityRole="link"
                onPress={() => void Linking.openURL(`${API_URL}/settings/payments`)}
                style={[face.semiBold, { color: color.link, textDecorationLine: "underline" }]}
              >
                Set up payments
              </Text>
            ) : null}
          </T>
        </Notice>
      ) : null}
      {!hasDraft && !hasAccepted ? (
        <View style={styles.start}>
          <T muted style={{ flexGrow: 1, flexBasis: 192, flexShrink: 1 }}>
            No quote yet. Start one to price the repairs for these findings.
          </T>
          <Button
            title="Start Quote"
            kind="secondary"
            onPress={() => {
              startQuote(services.sync, company.id, job.id);
              haptics.success();
            }}
          />
        </View>
      ) : null}
      {quotes.map((q) => (
        <QuoteCard key={q.id} job={job} quote={q} />
      ))}
    </View>
  );
}

function QuoteCard({ job, quote }: { job: Job; quote: JobQuote }) {
  const company = useCompany();
  const draft = quote.status === "draft";
  const total = draft
    ? quoteTotals(
        quote.lines,
        quote.discount_cents,
        company.settings.tax_rate_bps ?? 0,
        company.settings.deposit,
      ).total_cents
    : quote.total_cents;
  return (
    <Card style={styles.card}>
      <View style={styles.titleRow}>
        <T variant="cardTitle" style={{ flexShrink: 1 }}>
          {`Quote${quote.number ? ` #${quote.number}` : ""} · ${QUOTE_STATUS_LABELS[quote.status]}`}
        </T>
        <Text style={[styles.total, { color: color.text }]} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
          {formatCents(total)}
        </Text>
      </View>
      {draft ? <QuoteBuilder job={job} quote={quote} /> : <SentQuote job={job} quote={quote} />}
    </Card>
  );
}

function QuoteBuilder({ job, quote }: { job: Job; quote: JobQuote }) {
  const company = useCompany();
  const { services, membership } = useSession();
  const sync = services.sync;
  const config = useInspectionConfig(company.id);
  const inspection = useJobInspection(company.id, job.id);
  const priceBook = usePriceBook(company.id).filter((i) => i.active);
  const [itemId, setItemId] = useState<string | null>(null);
  const [custom, setCustom] = useState({ description: "", price: "" });
  const [discount, setDiscountText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // A line or discount typed but not added or saved asks before leaving (owner, 2026-10-20).
  useUnsavedChanges(
    Boolean(custom.description.trim() || custom.price.trim()) ||
      (discount !== null &&
        (discount.trim() === "" ? 0 : parseDollars(discount)) !== (quote.discount_cents ?? 0)),
  );
  // Owners and admins may discount past the techs' limit (owner, 2026-10-18).
  const isOwner = isManagerRole(membership?.role);
  const limitBps = company.settings.tech_discount_limit_bps ?? 0;

  const totals = quoteTotals(
    quote.lines,
    quote.discount_cents,
    company.settings.tax_rate_bps ?? 0,
    company.settings.deposit,
  );
  const findings = [...inspection.findings]
    .filter((f) => f.status !== "repaired")
    .sort((a, b) => a.id.localeCompare(b.id));
  const suggestionsFor = useMemo(
    () => (componentId: string | null | undefined) => {
      const comp = componentId ? inspection.componentById.get(componentId) : undefined;
      const type = comp ? config.componentTypeById.get(comp.component_type_id) : undefined;
      return suggestItems(priceBook, type?.key);
    },
    [inspection, config, priceBook],
  );
  const onQuote = new Set(quote.lines.map((l) => l.price_book_item_id).filter(Boolean));

  function saveDiscount() {
    if (discount === null) return;
    const cents = discount.trim() === "" ? 0 : parseDollars(discount);
    setDiscountText(null);
    if (cents === null || cents < 0) return setError("Enter a discount like 50 or 50.00.");
    if (!discountAllowed(totals.subtotal_cents, cents, isOwner, limitBps))
      return setError(`Techs can give up to ${limitBps / 100}% off. Ask an owner for more.`);
    setError(null);
    if (cents !== quote.discount_cents) setDiscount(sync, company, quote, cents);
  }

  function addCustom() {
    const cents = parseDollars(custom.price);
    if (!custom.description.trim()) return setError("Describe the work.");
    if (cents === null || cents < 0) return setError("Enter a price like 125 or 125.50.");
    setError(null);
    addLine(sync, company, quote, {
      description: custom.description.trim(),
      quantity: 1,
      unit_price_cents: cents,
      taxable: true,
    });
    setCustom({ description: "", price: "" });
    haptics.success();
  }

  async function send() {
    setError(null);
    setSending(true);
    try {
      const r = await sendQuoteFromPhone(quote, company.name);
      await Share.share({ message: r.message });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.builder}>
      {findings.length ? (
        <View style={styles.stack}>
          <T variant="subHeading">Add From Findings</T>
          {findings.map((f) => (
            <FindingSuggestions
              key={f.id}
              title={f.title}
              items={suggestionsFor(f.job_component_id)}
              added={(item) => onQuote.has(item.id)}
              onAdd={(item) => addItem(sync, company, quote, item, f.id)}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.stack}>
        <T variant="subHeading">Lines</T>
        {quote.lines.length === 0 ? <T muted>No lines yet.</T> : null}
        {quote.lines.map((l) => (
          <LineEditor
            key={l.id}
            line={l}
            onError={setError}
            onSave={(values) => updateLine(sync, company, quote, l.id, values)}
            onRemove={() =>
              confirmDestructive({
                title: `Remove “${l.description}” from the quote?`,
                confirm: "Remove Line",
                onConfirm: () => removeLine(sync, company, quote, l.id),
              })
            }
          />
        ))}
      </View>

      {priceBook.length ? (
        <View style={styles.addRow}>
          <Select
            label="Add from the price book"
            options={priceBook.map((i) => ({
              value: i.id,
              label: `${i.name} (${formatCents(i.price_cents)})`,
            }))}
            value={itemId}
            onChange={setItemId}
            style={{ flex: 1 }}
          />
          <Button
            title="Add"
            style={{ alignSelf: "flex-end" }}
            kind="secondary"
            disabled={!itemId}
            onPress={() => {
              const item = priceBook.find((i) => i.id === itemId);
              setItemId(null);
              if (item) addItem(sync, company, quote, item, null);
            }}
          />
        </View>
      ) : null}

      <View style={styles.stack}>
        <Field
          label="Custom line"
          placeholder="Replace skimmer lid"
          value={custom.description}
          onChangeText={(v) => setCustom((c) => ({ ...c, description: v }))}
        />
        <View style={styles.addRow}>
          <View style={{ flex: 1 }}>
            <Field
              label="Price ($)"
              keyboardType="decimal-pad"
              value={custom.price}
              onChangeText={(v) => setCustom((c) => ({ ...c, price: v }))}
              style={tabular}
            />
          </View>
          <Button
            title="Add Line"
            kind="secondary"
            onPress={addCustom}
            style={{ alignSelf: "flex-end" }}
          />
        </View>
      </View>

      <View style={{ maxWidth: 320 }}>
        <Field
          label="Discount ($)"
          keyboardType="decimal-pad"
          value={discount ?? (quote.discount_cents ? (quote.discount_cents / 100).toFixed(2) : "")}
          onChangeText={setDiscountText}
          onBlur={saveDiscount}
          hint={isOwner ? undefined : `Techs can give up to ${limitBps / 100}% off.`}
        />
      </View>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <View style={styles.totals}>
        <Amount label="Subtotal" value={formatCents(totals.subtotal_cents)} muted />
        {totals.discount_cents ? (
          <Amount label="Discount" value={`−${formatCents(totals.discount_cents)}`} muted />
        ) : null}
        <Amount label="Tax" value={formatCents(totals.tax_cents)} muted />
        <Amount label="Total" value={formatCents(totals.total_cents)} strong />
        <Amount label="Deposit" value={formatCents(totals.deposit_cents)} muted />
      </View>

      <View style={styles.sendRow}>
        <Button
          title={sending ? "Sending…" : "Send Quote"}
          disabled={sending || !reportsOnline || quote.lines.length === 0}
          onPress={() => void send()}
        />
        <T variant="secondary" muted style={{ flexShrink: 1, flexBasis: 160, flexGrow: 1 }}>
          Locks the prices and gives you a link for the customer.
        </T>
      </View>
      {!reportsOnline ? (
        <T variant="secondary" muted>
          This app isn’t connected to the Sundeck Pro server, so it can’t send.
        </T>
      ) : null}
      {/* Apps: the customer can accept on this phone, offline (S6). */}
      <Button
        title="Customer Signs Now"
        kind="secondary"
        disabled={quote.lines.length === 0}
        onPress={() => router.push(`/jobs/${job.id}/signature?quote=${quote.id}`)}
      />
    </View>
  );
}

/** A label and an amount on one line, money right-aligned and tabular. */
function Amount({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.amountRow}>
      <T variant="secondary" muted={muted} style={strong && face.semiBold}>
        {label}
      </T>
      <T variant="secondary" style={[tabular, styles.money, strong && face.semiBold]}>
        {value}
      </T>
    </View>
  );
}

/** A finding and the price book items that fit it, as "+ Item · $250.00" buttons. */
function FindingSuggestions({
  title,
  items,
  added,
  onAdd,
}: {
  title: string;
  items: PriceBookItem[];
  added: (item: PriceBookItem) => boolean;
  onAdd: (item: PriceBookItem) => void;
}) {
  return (
    <View style={{ gap: space["2"] }}>
      <T variant="bodyEmphasis">{title}</T>
      {items.length === 0 ? (
        <T variant="secondary" muted>
          No price book items for this component. Add a custom line.
        </T>
      ) : (
        <View style={styles.wrap}>
          {items.map((item) => {
            const on = added(item);
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`Add ${item.name}, ${formatCents(item.price_cents)}`}
                accessibilityState={{ disabled: on }}
                disabled={on}
                onPress={() => onAdd(item)}
                android_ripple={{ color: color.ripple }}
                style={({ pressed }) => [
                  styles.suggestion,
                  { backgroundColor: pressed ? color.tintedPressed : color.tinted },
                  on && { opacity: 0.5 },
                ]}
              >
                <Text
                  style={[styles.suggestionText, { color: color.link }]}
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                >
                  {`${on ? "✓" : "+"} ${item.name} · ${formatCents(item.price_cents)}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** One line in a well: Description, then Qty and Price each side by side, its total, Remove. */
function LineEditor({
  line: l,
  onSave,
  onRemove,
  onError,
}: {
  line: JobQuote["lines"][number];
  onSave: (values: { description?: string; quantity?: number; unit_price_cents?: number }) => void;
  onRemove: () => void;
  onError: (e: string | null) => void;
}) {
  const [description, setDescription] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<string | null>(null);
  const [price, setPrice] = useState<string | null>(null);

  // Edits not saved yet (they save when the field is left) ask before leaving (2026-10-20).
  useUnsavedChanges(
    (description !== null && description.trim() !== l.description) ||
      (quantity !== null && Number(quantity.replace(",", ".")) !== Number(l.quantity)) ||
      (price !== null && parseDollars(price) !== l.unit_price_cents),
  );

  function commit() {
    if (description !== null && description.trim() && description.trim() !== l.description)
      onSave({ description: description.trim() });
    if (quantity !== null) {
      const n = Number(quantity.replace(",", "."));
      if (n > 0 && n < 100_000) {
        if (n !== Number(l.quantity)) onSave({ quantity: Math.round(n * 100) / 100 });
      } else onError("Quantity must be more than 0.");
    }
    if (price !== null) {
      const cents = parseDollars(price);
      if (cents !== null && cents >= 0) {
        if (cents !== l.unit_price_cents) onSave({ unit_price_cents: cents });
      } else onError("Enter a price like 125 or 125.50.");
    }
    setDescription(null);
    setQuantity(null);
    setPrice(null);
  }

  return (
    <View style={[styles.well, { backgroundColor: color.well }]} accessibilityLabel={l.description}>
      <Field
        label="Description"
        value={description ?? l.description}
        onChangeText={setDescription}
        onBlur={commit}
      />
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field
            label="Qty"
            keyboardType="decimal-pad"
            value={quantity ?? String(Number(l.quantity))}
            onChangeText={setQuantity}
            onBlur={commit}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="Price each ($)"
            keyboardType="decimal-pad"
            value={price ?? (l.unit_price_cents / 100).toFixed(2)}
            onChangeText={setPrice}
            onBlur={commit}
          />
        </View>
      </View>
      <View style={styles.lineFoot}>
        <T variant="bodyEmphasis" style={tabular}>
          {formatCents(lineTotal(l))}
        </T>
        <Button title="Remove" kind="quiet" onPress={onRemove} />
      </View>
    </View>
  );
}

function SentQuote({ job, quote }: { job: Job; quote: JobQuote }) {
  const company = useCompany();
  const link = quoteLink(quote.token);
  const payments = useRows<PaymentRow>("payment", company.id);
  const deposit = payments.find(
    (p) => p.quote_id === quote.id && (p.status === "succeeded" || p.status === "pending"),
  );
  const repair = useRow<Job>("job", quote.repair_job_id ?? undefined);
  return (
    <View style={styles.stack}>
      <View style={{ gap: 4 }}>
        {quote.lines.map((l) => (
          <View key={l.id} style={styles.amountRow}>
            <T variant="secondary" style={{ flex: 1 }}>
              {`${l.description}${Number(l.quantity) !== 1 ? ` × ${Number(l.quantity)}` : ""}`}
            </T>
            <T variant="secondary" style={[tabular, styles.money]}>
              {formatCents(lineTotal(l))}
            </T>
          </View>
        ))}
      </View>
      <T variant="secondary" muted>
        {`Deposit ${formatCents(quote.deposit_cents)}${
          deposit
            ? ` · ${PAYMENT_LABELS[deposit.status]} (${deposit.method === "ach" ? "bank" : "card"})`
            : ""
        }`}
      </T>
      {link ? <LinkRow url={link} message={quoteShareText(company.name, link)} /> : null}
      {quote.status === "accepted" ? (
        <T>
          {`Accepted by ${quote.accepted_by_name ?? "the customer"}${
            quote.accepted_at
              ? ` on ${new Date(quote.accepted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
              : ""
          }.`}
          {quote.repair_job_id ? " " : null}
          {quote.repair_job_id ? (
            <Text
              accessibilityRole="link"
              onPress={() => router.push(`/jobs/${quote.repair_job_id}`)}
              style={[face.semiBold, { color: color.link, textDecorationLine: "underline" }]}
            >
              {`Repair job${repair?.number ? ` #${repair.number}` : ""}`}
            </Text>
          ) : null}
        </T>
      ) : null}
      {quote.status === "sent" ? (
        <Button
          title="Customer Signs Now"
          kind="secondary"
          onPress={() => router.push(`/jobs/${job.id}/signature?quote=${quote.id}`)}
        />
      ) : null}
    </View>
  );
}

/**
 * The customer link (spec 5.4): the link in a read-only outlined field, in monospace and cut
 * off, beside a button that shares it (the apps have no clipboard package; the share sheet
 * has Copy).
 */
export function LinkRow({ url, message }: { url: string; message: string }) {
  return (
    <View style={styles.linkRow}>
      <View
        style={[styles.linkBox, { borderColor: color.controlBorder }]}
        accessible
        accessibilityLabel={`Customer link, ${url}`}
      >
        <Text
          style={[styles.mono, { color: color.text }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.6}
          selectable
        >
          {url}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share Link"
        onPress={() => void Share.share({ message })}
        android_ripple={{ color: color.ripple }}
        style={({ pressed }) => [
          styles.shareButton,
          { backgroundColor: pressed ? color.tintedPressed : color.tinted },
        ]}
      >
        <WebIcon name="share" size={20} color={color.link} />
        <Text style={[styles.shareText, { color: color.link }]} maxFontSizeMultiplier={1.6}>
          Share Link
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space["3"] },
  card: { gap: space["4"] },
  builder: { gap: space["5"] },
  start: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space["3"] },
  titleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    columnGap: space["3"],
  },
  total: { ...face.semiBold, fontSize: 20, lineHeight: 28, fontVariant: ["tabular-nums"] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space["2"] },
  suggestion: {
    minHeight: minTap,
    borderRadius: shape.pill,
    paddingHorizontal: space["4"],
    justifyContent: "center",
  },
  suggestionText: { ...face.medium, fontSize: 15, lineHeight: 20 },
  well: { borderRadius: shape.block, padding: space["3"], gap: space["2"] },
  pair: { flexDirection: "row", gap: space["3"] },
  lineFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addRow: { flexDirection: "row", alignItems: "flex-end", gap: space["3"] },
  totals: { gap: 4, maxWidth: 384 },
  amountRow: { flexDirection: "row", justifyContent: "space-between", gap: space["4"] },
  money: { textAlign: "right" },
  sendRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space["3"] },
  linkRow: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  linkBox: {
    flex: 1,
    minHeight: minTap,
    borderWidth: 1,
    borderRadius: shape.pill,
    paddingHorizontal: space["3"],
    justifyContent: "center",
  },
  mono: { fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 15 },
  shareButton: {
    minHeight: minTap,
    borderRadius: shape.pill,
    paddingHorizontal: space["4"],
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
  },
  shareText: { ...face.semiBold, fontSize: 17 },
});
