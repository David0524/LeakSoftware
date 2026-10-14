import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Share, View } from "react-native";
import {
  QUOTE_STATUS_LABELS,
  discountAllowed,
  formatCents,
  lineTotal,
  parseDollars,
  quoteShareText,
  quoteTotals,
  suggestItems,
  type Job,
} from "@leakbook/core";
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
import { useCompany, useSession } from "../../state/session";
import { Button, Card, Field, Notice, Row, T } from "../../ui/components";
import { color } from "../../ui/theme";
import { confirmDestructive } from "../../ui/confirm";
import { SwipeToDelete } from "../../ui/SwipeRow";

/** Build a repair quote from the findings and price book (works offline), then send it. */
export function QuoteTab({ job }: { job: Job }) {
  const company = useCompany();
  const { services } = useSession();
  const quotes = useJobQuotes(company.id, job.id);
  const quote = quotes.find((q) => q.status === "draft") ?? quotes[0];

  if (!quote) {
    return (
      <Card>
        <T variant="muted">No quote yet. Start one to price the repairs for these findings.</T>
        <Button title="Start Quote" onPress={() => startQuote(services.sync, company.id, job.id)} />
      </Card>
    );
  }
  return quote.status === "draft" ? (
    <DraftQuote job={job} quote={quote} />
  ) : (
    <SentQuote job={job} quote={quote} />
  );
}

function DraftQuote({ job, quote }: { job: Job; quote: JobQuote }) {
  const company = useCompany();
  const { services, membership } = useSession();
  const sync = services.sync;
  const config = useInspectionConfig(company.id);
  const inspection = useJobInspection(company.id, job.id);
  const priceBook = usePriceBook(company.id);
  const [custom, setCustom] = useState({ description: "", price: "" });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [discount, setDiscountText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const isOwner = membership?.role === "owner";
  const limitBps = company.settings.tech_discount_limit_bps ?? 0;

  const totals = quoteTotals(
    quote.lines,
    quote.discount_cents,
    company.settings.tax_rate_bps ?? 0,
    company.settings.deposit,
  );
  const findings = inspection.findings.filter((f) => f.status !== "repaired");
  const suggestionsFor = useMemo(
    () => (componentId: string | null | undefined) => {
      const comp = componentId ? inspection.componentById.get(componentId) : undefined;
      const type = comp ? config.componentTypeById.get(comp.component_type_id) : undefined;
      return suggestItems(priceBook, type?.key);
    },
    [inspection, config, priceBook],
  );
  const onQuote = new Set(quote.lines.map((l) => l.price_book_item_id).filter(Boolean));

  const edit = (key: string, fallback: string) => edits[key] ?? fallback;
  const commit = (lineId: string, field: "description" | "quantity" | "price") => {
    const key = `${lineId}:${field}`;
    const value = edits[key];
    setEdits(({ [key]: _, ...rest }) => rest);
    if (value === undefined) return;
    if (field === "description") {
      if (value.trim()) updateLine(sync, company, quote, lineId, { description: value.trim() });
    } else if (field === "quantity") {
      const n = Number(value.replace(",", "."));
      if (n > 0 && n < 100_000)
        updateLine(sync, company, quote, lineId, { quantity: Math.round(n * 100) / 100 });
      else setError("Quantity must be more than 0.");
    } else {
      const cents = parseDollars(value);
      if (cents !== null && cents >= 0)
        updateLine(sync, company, quote, lineId, { unit_price_cents: cents });
      else setError("Enter a price like 125 or 125.50.");
    }
  };

  function saveDiscount() {
    if (discount === null) return;
    const cents = discount.trim() === "" ? 0 : parseDollars(discount);
    setDiscountText(null);
    if (cents === null || cents < 0) return setError("Enter a discount like 50 or 50.00.");
    if (!discountAllowed(totals.subtotal_cents, cents, isOwner, limitBps))
      return setError(`Techs can give up to ${limitBps / 100}% off. Ask an owner for more.`);
    setError(null);
    setDiscount(sync, company, quote, cents);
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
    <View style={{ gap: 16 }}>
      {findings.length ? (
        <Card>
          <T variant="heading">Add From Findings</T>
          {findings.map((f) => {
            const items = suggestionsFor(f.job_component_id);
            return (
              <View key={f.id} style={{ gap: 6 }}>
                <T variant="strong">{f.title}</T>
                {items.length === 0 ? (
                  <T variant="muted">No price book items for this component. Add a custom line.</T>
                ) : (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {items.map((item) => {
                      const added = onQuote.has(item.id);
                      return (
                        <Pressable
                          key={item.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Add ${item.name}, ${formatCents(item.price_cents)}`}
                          accessibilityState={{ disabled: added }}
                          disabled={added}
                          onPress={() => addItem(sync, company, quote, item, f.id)}
                          style={{
                            minHeight: 44,
                            justifyContent: "center",
                            paddingHorizontal: 12,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: color.controlBorder,
                            backgroundColor: color.surface,
                            opacity: added ? 0.5 : 1,
                          }}
                        >
                          <T variant="small">
                            {added ? "✓ " : "+ "}
                            {item.name} · {formatCents(item.price_cents)}
                          </T>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </Card>
      ) : null}

      <Card>
        <T variant="heading">Lines</T>
        {quote.lines.length === 0 ? <T variant="muted">No lines yet.</T> : null}
        {quote.lines.map((l) => {
          const remove = () =>
            confirmDestructive({
              title: "Remove this line?",
              message: l.description,
              confirm: "Remove",
              cancel: "Keep",
              onConfirm: () => removeLine(sync, company, quote, l.id),
            });
          return (
            // Swipe left to remove, or use the line's Remove button (also for screen readers).
            <SwipeToDelete key={l.id} label="Remove" onDelete={remove}>
              <View
                style={{
                  gap: 8,
                  paddingBottom: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: color.border,
                  backgroundColor: color.surface,
                }}
              >
                <Field
                  label="Description"
                  value={edit(`${l.id}:description`, l.description)}
                  onChangeText={(v) => setEdits((e) => ({ ...e, [`${l.id}:description`]: v }))}
                  onBlur={() => commit(l.id, "description")}
                />
                <Row style={{ gap: 12, alignItems: "flex-end" }}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Qty"
                      value={edit(`${l.id}:quantity`, String(Number(l.quantity)))}
                      onChangeText={(v) => setEdits((e) => ({ ...e, [`${l.id}:quantity`]: v }))}
                      onBlur={() => commit(l.id, "quantity")}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={{ flex: 2 }}>
                    <Field
                      label="Price each ($)"
                      value={edit(`${l.id}:price`, (l.unit_price_cents / 100).toFixed(2))}
                      onChangeText={(v) => setEdits((e) => ({ ...e, [`${l.id}:price`]: v }))}
                      onBlur={() => commit(l.id, "price")}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  {/* Line total and Remove close the Qty and Price row instead of their own row. */}
                  <View style={{ alignItems: "flex-end", gap: 4, paddingBottom: 2 }}>
                    <T variant="strong">{formatCents(lineTotal(l))}</T>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${l.description || "line"}`}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      onPress={remove}
                    >
                      <T variant="strong" style={{ color: color.link }}>
                        Remove
                      </T>
                    </Pressable>
                  </View>
                </Row>
              </View>
            </SwipeToDelete>
          );
        })}
        <Row style={{ gap: 12, alignItems: "flex-start" }}>
          <View style={{ flex: 2 }}>
            <Field
              label="Work"
              value={custom.description}
              onChangeText={(v) => setCustom((c) => ({ ...c, description: v }))}
              placeholder="Patch skimmer throat"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Price ($)"
              value={custom.price}
              onChangeText={(v) => setCustom((c) => ({ ...c, price: v }))}
              keyboardType="decimal-pad"
            />
          </View>
        </Row>
        <Button title="Add Line" kind="secondary" onPress={addCustom} />
      </Card>

      <Card>
        <Field
          label="Discount ($)"
          value={discount ?? (quote.discount_cents ? (quote.discount_cents / 100).toFixed(2) : "")}
          onChangeText={setDiscountText}
          onBlur={saveDiscount}
          keyboardType="decimal-pad"
          hint={isOwner ? undefined : `Up to ${limitBps / 100}% of the subtotal.`}
        />
        <Totals totals={totals} />
      </Card>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <Card>
        <T variant="heading">Customer Decision</T>
        <T variant="muted">
          Sign on site to accept now (works offline), or send the quote to accept and pay online.
        </T>
        <Button
          title="Customer Signs Now"
          disabled={quote.lines.length === 0}
          onPress={() => router.push(`/jobs/${job.id}/signature?quote=${quote.id}`)}
        />
        <Button
          title="Send Quote"
          kind="secondary"
          loading={sending}
          disabled={!reportsOnline || quote.lines.length === 0}
          onPress={() => void send()}
        />
        {!reportsOnline ? (
          <T variant="muted">This app isn’t connected to the Tidemark server, so it can’t send.</T>
        ) : null}
      </Card>
    </View>
  );
}

function Totals({ totals }: { totals: ReturnType<typeof quoteTotals> }) {
  const row = (label: string, value: string, strong = false) => (
    <Row key={label} style={{ justifyContent: "space-between" }}>
      <T variant={strong ? "strong" : "body"}>{label}</T>
      <T variant={strong ? "strong" : "body"}>{value}</T>
    </Row>
  );
  return (
    <View style={{ gap: 4 }}>
      {row("Subtotal", formatCents(totals.subtotal_cents))}
      {totals.discount_cents ? row("Discount", `−${formatCents(totals.discount_cents)}`) : null}
      {totals.tax_cents ? row("Tax", formatCents(totals.tax_cents)) : null}
      {row("Total", formatCents(totals.total_cents), true)}
      {totals.deposit_cents ? row("Deposit", formatCents(totals.deposit_cents)) : null}
    </View>
  );
}

function SentQuote({ job, quote }: { job: Job; quote: JobQuote }) {
  const company = useCompany();
  const { services } = useSession();
  const link = quoteLink(quote.token);
  return (
    <View style={{ gap: 16 }}>
      <Card>
        <T variant="heading">
          Quote{quote.number ? ` #${quote.number}` : ""} · {QUOTE_STATUS_LABELS[quote.status]}
        </T>
        {quote.lines.map((l) => (
          <Row key={l.id} style={{ justifyContent: "space-between" }}>
            <T variant="small" style={{ flex: 1 }}>
              {l.description}
            </T>
            <T variant="small">{formatCents(lineTotal(l))}</T>
          </Row>
        ))}
        <Totals
          totals={{
            subtotal_cents: quote.subtotal_cents,
            discount_cents: quote.discount_cents,
            tax_cents: quote.tax_cents,
            total_cents: quote.total_cents,
            deposit_cents: quote.deposit_cents,
          }}
        />
        {quote.status === "accepted" ? (
          <T variant="body">
            Accepted by {quote.accepted_by_name}
            {quote.accepted_at ? ` on ${new Date(quote.accepted_at).toLocaleDateString()}` : ""}.
            The office schedules the repair.
          </T>
        ) : (
          <T variant="muted">Waiting for the customer to accept.</T>
        )}
      </Card>
      {link ? (
        <Button
          title="Share Quote Link"
          kind="secondary"
          onPress={() =>
            void Share.share({
              message: quoteShareText(company.name, link),
            })
          }
        />
      ) : null}
      {quote.status === "sent" ? (
        <Button
          title="Customer Signs Now"
          onPress={() => router.push(`/jobs/${job.id}/signature?quote=${quote.id}`)}
        />
      ) : null}
      {quote.status === "declined" || quote.status === "expired" ? (
        <Button
          title="Start New Quote"
          kind="secondary"
          onPress={() => startQuote(services.sync, company.id, job.id)}
        />
      ) : null}
    </View>
  );
}
