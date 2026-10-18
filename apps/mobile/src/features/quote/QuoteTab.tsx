import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Pressable, Share, View, type TextInput } from "react-native";
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
  type PriceBookItem,
  isManagerRole,
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
import {
  AmountRow,
  Block,
  Button,
  Card,
  Field,
  FieldGroup,
  FieldRow,
  Group,
  ListRow,
  Notice,
  Pill,
  Row,
  T,
} from "../../ui/components";
import { Icon } from "../../ui/Icon";
import { color, ios, QUOTE_STATUS_COLOR, space } from "../../ui/theme";
import { confirmDestructive } from "../../ui/confirm";
import { SwipeToDelete } from "../../ui/SwipeRow";

/** On iPhone, text outside grouped blocks lines up with the rows' text. */
const inset = ios ? { paddingHorizontal: space["4"] } : null;

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
  // Owners and admins may discount past the techs' limit (owner, 2026-10-18).
  const isOwner = isManagerRole(membership?.role);
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
  const commit = (lineId: string, field: LineField) => {
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

  const discountField = (
    <FieldRow
      label="Discount ($)"
      value={discount ?? (quote.discount_cents ? (quote.discount_cents / 100).toFixed(2) : "")}
      onChangeText={setDiscountText}
      onBlur={saveDiscount}
      keyboardType="decimal-pad"
      placeholder={ios ? "0.00" : undefined}
      hint={isOwner ? undefined : `Up to ${limitBps / 100}% of the subtotal.`}
    />
  );

  return (
    <View style={{ gap: 16 }}>
      {findings.length ? (
        <Block title="Add From Findings">
          {findings.map((f) => (
            <FindingSuggestions
              key={f.id}
              title={f.title}
              items={suggestionsFor(f.job_component_id)}
              added={(item) => onQuote.has(item.id)}
              onAdd={(item) => addItem(sync, company, quote, item, f.id)}
            />
          ))}
        </Block>
      ) : null}

      <Block title="Lines">
        {quote.lines.length === 0 ? (
          <T variant="muted" style={inset}>
            No lines yet.
          </T>
        ) : null}
        {quote.lines.map((l) => (
          <LineEditor
            key={l.id}
            line={l}
            edit={edit}
            setEdit={(field, v) => setEdits((e) => ({ ...e, [`${l.id}:${field}`]: v }))}
            commit={(field) => commit(l.id, field)}
            remove={() =>
              confirmDestructive({
                title: "Remove this line?",
                message: l.description,
                confirm: "Remove",
                cancel: "Keep",
                onConfirm: () => removeLine(sync, company, quote, l.id),
              })
            }
          />
        ))}
        <NewLine custom={custom} setCustom={setCustom} onAdd={addCustom} />
      </Block>

      {ios ? (
        // iPhone: one grouped block, the discount typed in its own row above the totals.
        <Group>
          {discountField}
          {totalLines(totals).map((t) => (
            <AmountRow key={t.label} {...t} />
          ))}
        </Group>
      ) : (
        <Card>
          {discountField}
          <Totals totals={totals} />
        </Card>
      )}

      {error ? <Notice tone="error">{error}</Notice> : null}

      <Block
        title="Customer Decision"
        note="Sign on site to accept now (works offline), or send the quote to accept and pay online."
      >
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
          <T variant="muted" style={inset}>
            This app isn’t connected to the Sundeck Pro server, so it can’t send.
          </T>
        ) : null}
      </Block>
    </View>
  );
}

/**
 * A finding and the price book items that fit it. iPhone: a grouped block, one row per item
 * with + to add (a checkmark once added). Android: buttons in the card, as before.
 */
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
  const none = "No price book items for this component. Add a custom line.";
  if (ios)
    return (
      <Group>
        <ListRow>
          <T variant="strong">{title}</T>
        </ListRow>
        {items.length === 0 ? (
          <ListRow>
            <T variant="muted">{none}</T>
          </ListRow>
        ) : null}
        {items.map((item) =>
          added(item) ? (
            <ListRow
              key={item.id}
              title={item.name}
              detail={formatCents(item.price_cents)}
              trailing={
                <Icon name="checkmark" size={17} color={color.textMuted} weight="semibold" />
              }
            />
          ) : (
            <ListRow
              key={item.id}
              title={item.name}
              detail={formatCents(item.price_cents)}
              accessibilityLabel={`Add ${item.name}, ${formatCents(item.price_cents)}`}
              chevron={false}
              trailing={<Icon name="add" size={20} color={color.link} weight="semibold" />}
              onPress={() => onAdd(item)}
            />
          ),
        )}
      </Group>
    );
  return (
    <View style={{ gap: 6 }}>
      <T variant="strong">{title}</T>
      {items.length === 0 ? (
        <T variant="muted">{none}</T>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
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
                style={{
                  minHeight: 44,
                  justifyContent: "center",
                  paddingHorizontal: 12,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: color.controlBorder,
                  backgroundColor: color.surface,
                  opacity: on ? 0.5 : 1,
                }}
              >
                <T variant="small">
                  {on ? "✓ " : "+ "}
                  {item.name} · {formatCents(item.price_cents)}
                </T>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

type LineField = "description" | "quantity" | "price";

/** One quote line to edit. iPhone: a grouped block; Android: fields in the card, as before. */
function LineEditor({
  line: l,
  edit,
  setEdit,
  commit,
  remove,
}: {
  line: JobQuote["lines"][number];
  edit: (key: string, fallback: string) => string;
  setEdit: (field: LineField, v: string) => void;
  commit: (field: LineField) => void;
  remove: () => void;
}) {
  const qtyRef = useRef<TextInput>(null);
  const priceRef = useRef<TextInput>(null);
  const description = edit(`${l.id}:description`, l.description);
  const quantity = edit(`${l.id}:quantity`, String(Number(l.quantity)));
  const price = edit(`${l.id}:price`, (l.unit_price_cents / 100).toFixed(2));
  const removeButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Remove ${l.description || "line"}`}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      onPress={remove}
      style={ios ? { minHeight: 44, justifyContent: "center" } : undefined}
    >
      <T variant={ios ? "body" : "strong"} style={{ color: ios ? color.fail : color.link }}>
        Remove
      </T>
    </Pressable>
  );

  if (ios)
    return (
      // Swipe left to remove, or use the line's Remove button (also for screen readers).
      <View style={{ borderRadius: 12, overflow: "hidden" }}>
        <SwipeToDelete label="Remove" onDelete={remove}>
          <Group>
            <FieldRow
              label="Description"
              value={description}
              onChangeText={(v) => setEdit("description", v)}
              onBlur={() => commit("description")}
              next={qtyRef}
            />
            <FieldRow
              ref={qtyRef}
              label="Qty"
              value={quantity}
              onChangeText={(v) => setEdit("quantity", v)}
              onBlur={() => commit("quantity")}
              keyboardType="decimal-pad"
              next={priceRef}
            />
            <FieldRow
              ref={priceRef}
              label="Price each ($)"
              value={price}
              onChangeText={(v) => setEdit("price", v)}
              onBlur={() => commit("price")}
              keyboardType="decimal-pad"
            />
            {/* Remove, and the line's total on the right. */}
            <Row style={{ justifyContent: "space-between", paddingHorizontal: space["4"] }}>
              {removeButton}
              <T variant="strong" style={{ fontVariant: ["tabular-nums"] }}>
                {formatCents(lineTotal(l))}
              </T>
            </Row>
          </Group>
        </SwipeToDelete>
      </View>
    );

  return (
    // Swipe left to remove, or use the line's Remove button (also for screen readers).
    <SwipeToDelete label="Remove" onDelete={remove}>
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
          value={description}
          onChangeText={(v) => setEdit("description", v)}
          onBlur={() => commit("description")}
        />
        <Row style={{ gap: 12, alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>
            <Field
              label="Qty"
              value={quantity}
              onChangeText={(v) => setEdit("quantity", v)}
              onBlur={() => commit("quantity")}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={{ flex: 2 }}>
            <Field
              label="Price each ($)"
              value={price}
              onChangeText={(v) => setEdit("price", v)}
              onBlur={() => commit("price")}
              keyboardType="decimal-pad"
            />
          </View>
          {/* Line total and Remove close the Qty and Price row instead of their own row. */}
          <View style={{ alignItems: "flex-end", gap: 4, paddingBottom: 2 }}>
            <T variant="strong">{formatCents(lineTotal(l))}</T>
            {removeButton}
          </View>
        </Row>
      </View>
    </SwipeToDelete>
  );
}

type Custom = { description: string; price: string };

/** A custom line: what the work is and its price, then Add Line. */
function NewLine({
  custom,
  setCustom,
  onAdd,
}: {
  custom: Custom;
  setCustom: (update: (c: Custom) => Custom) => void;
  onAdd: () => void;
}) {
  const priceRef = useRef<TextInput>(null);
  const work = (
    <FieldRow
      label="Work"
      value={custom.description}
      onChangeText={(v) => setCustom((c) => ({ ...c, description: v }))}
      placeholder="Patch skimmer throat"
      next={priceRef}
    />
  );
  const price = (
    <FieldRow
      ref={priceRef}
      label="Price ($)"
      value={custom.price}
      onChangeText={(v) => setCustom((c) => ({ ...c, price: v }))}
      keyboardType="decimal-pad"
      placeholder={ios ? "0.00" : undefined}
    />
  );
  return (
    <>
      {ios ? (
        <FieldGroup>
          {work}
          {price}
        </FieldGroup>
      ) : (
        <Row style={{ gap: 12, alignItems: "flex-start" }}>
          <View style={{ flex: 2 }}>{work}</View>
          <View style={{ flex: 1 }}>{price}</View>
        </Row>
      )}
      <Button title="Add Line" kind="secondary" onPress={onAdd} />
    </>
  );
}

/** Subtotal to deposit, the total in bold. */
function totalLines(totals: ReturnType<typeof quoteTotals>) {
  return [
    { label: "Subtotal", value: formatCents(totals.subtotal_cents) },
    totals.discount_cents
      ? { label: "Discount", value: `−${formatCents(totals.discount_cents)}` }
      : null,
    totals.tax_cents ? { label: "Tax", value: formatCents(totals.tax_cents) } : null,
    { label: "Total", value: formatCents(totals.total_cents), strong: true },
    totals.deposit_cents ? { label: "Deposit", value: formatCents(totals.deposit_cents) } : null,
  ].filter((t) => t !== null);
}

/** Android: the totals as lines of text in the card. */
function Totals({ totals }: { totals: ReturnType<typeof quoteTotals> }) {
  return (
    <View style={{ gap: 4 }}>
      {totalLines(totals).map((t) => (
        <Row key={t.label} style={{ justifyContent: "space-between" }}>
          <T variant={t.strong ? "strong" : "body"}>{t.label}</T>
          <T variant={t.strong ? "strong" : "body"}>{t.value}</T>
        </Row>
      ))}
    </View>
  );
}

function SentQuote({ job, quote }: { job: Job; quote: JobQuote }) {
  const company = useCompany();
  const { services } = useSession();
  const link = quoteLink(quote.token);
  const totals = {
    subtotal_cents: quote.subtotal_cents,
    discount_cents: quote.discount_cents,
    tax_cents: quote.tax_cents,
    total_cents: quote.total_cents,
    deposit_cents: quote.deposit_cents,
  };
  const heading = (
    <Row style={[{ justifyContent: "space-between" }, inset]}>
      <T variant="heading" style={{ flexShrink: 1 }}>
        {`Quote${quote.number ? ` #${quote.number}` : ""}`}
      </T>
      <Pill label={QUOTE_STATUS_LABELS[quote.status]} color={QUOTE_STATUS_COLOR[quote.status]} />
    </Row>
  );
  const decision =
    quote.status === "accepted" ? (
      <T variant="body" style={inset}>
        Accepted by {quote.accepted_by_name}
        {quote.accepted_at ? ` on ${new Date(quote.accepted_at).toLocaleDateString()}` : ""}. The
        office schedules the repair.
      </T>
    ) : (
      <T variant="muted" style={inset}>
        Waiting for the customer to accept.
      </T>
    );
  return (
    <View style={{ gap: 16 }}>
      {ios ? (
        // iPhone: the lines and totals as a grouped list, amounts on the right.
        <>
          {heading}
          <Group>
            {quote.lines.map((l) => (
              <AmountRow key={l.id} label={l.description} value={formatCents(lineTotal(l))} />
            ))}
            {totalLines(totals).map((t) => (
              <AmountRow key={t.label} {...t} />
            ))}
          </Group>
          {decision}
        </>
      ) : (
        <Card>
          {heading}
          {quote.lines.map((l) => (
            <Row key={l.id} style={{ justifyContent: "space-between" }}>
              <T variant="small" style={{ flex: 1 }}>
                {l.description}
              </T>
              <T variant="small">{formatCents(lineTotal(l))}</T>
            </Row>
          ))}
          <Totals totals={totals} />
          {decision}
        </Card>
      )}
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
