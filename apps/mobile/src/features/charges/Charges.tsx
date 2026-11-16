import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import {
  CHARGE_LOCKED,
  chargeCents,
  chargeDetail,
  chargesFooter,
  formatCents,
  monthName,
  type Job,
  type VisitCharge,
} from "@leakbook/core";
import {
  addVisitCharge,
  checkCharge,
  removeVisitCharge,
  useChargeItems,
  useChargesSentInvoice,
  useVisitCharges,
  type ChargeFieldErrors,
  type ChargeItem,
  type ChargeValues,
} from "../../data/charges";
import { useCompany } from "../../state/session";
import {
  Button,
  FieldGroup,
  FieldRow,
  Group,
  ListRow,
  Section,
  Segmented,
  T,
  Toggle,
} from "../../ui/components";
import { confirmDestructive } from "../../ui/confirm";
import { haptics } from "../../ui/haptics";
import { ModalSheet, useUnsavedChanges } from "../../ui/ModalSheet";
import { color, MAX_TEXT_SCALE, minTap, shape, space, tabular, type } from "../../ui/theme";
import { WebIcon } from "../../ui/WebIcon";

// Charges (owner, 2026-11-15: "a way to add extra charges ... like if they cleaned their filter
// or cleaned the salt cell, or replaced any parts"; docs/design/2026-11-15-monthly-billing.md),
// as the website's components/charges.tsx: a maintenance visit's Charges on its Checklist, after
// Regular Cleanings, billed on the customer's monthly invoice. The Add Charge sheet is shared
// with a month's Monthly Billing page, where it adds a line to the customer's draft.

/** The "+ Add Charge" row at the end of a grouped list. */
export function AddChargeRow({ onPress }: { onPress: () => void }) {
  return (
    <ListRow
      title="Add Charge"
      tone="link"
      chevron={false}
      accessibilityHint="Opens the Add Charge sheet"
      leading={
        <View style={[styles.plus, { backgroundColor: color.link }]}>
          <WebIcon name="plus" size={16} color={color.onPrimary} strokeWidth={3} />
        </View>
      }
      onPress={onPress}
    />
  );
}

/** Add Charge: a price book item and how many, or a custom description and price. */
export function AddChargeSheet(props: {
  open: boolean;
  items: ChargeItem[];
  /** Longest custom description (a visit's charge: 120; an invoice line: 200). */
  maxLength?: number;
  onClose: () => void;
  onAdd: (values: ChargeValues) => void;
}) {
  // A fresh form each time it opens.
  return <AddChargeForm key={props.open ? "open" : "closed"} {...props} />;
}

function AddChargeForm({
  open,
  items,
  maxLength = 200,
  onClose,
  onAdd,
}: {
  open: boolean;
  items: ChargeItem[];
  maxLength?: number;
  onClose: () => void;
  onAdd: (values: ChargeValues) => void;
}) {
  const [mode, setMode] = useState<"book" | "custom">(items.length ? "book" : "custom");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ChargeItem | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [taxable, setTaxable] = useState(true);
  const [errors, setErrors] = useState<ChargeFieldErrors>({});
  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => !q || i.name.toLowerCase().includes(q));
  const dirty =
    open &&
    (mode === "book"
      ? picked !== null
      : description.trim() !== "" || price.trim() !== "" || quantity.trim() !== "1");

  function add() {
    const checked =
      mode === "book"
        ? checkCharge({ mode, item: picked, quantity })
        : checkCharge({ mode, description, price, quantity, taxable });
    setErrors(checked.errors ?? {});
    if (!checked.values) {
      haptics.warning();
      return;
    }
    haptics.success();
    onAdd(checked.values);
  }

  return (
    <ModalSheet
      visible={open}
      onClose={onClose}
      title="Add Charge"
      done={open ? { label: "Add", onPress: add } : undefined}
    >
      {open ? (
        <View style={{ gap: space["5"] }}>
          <Dirty dirty={dirty} />
          <Segmented
            accessibilityLabel="Charge from"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setErrors({});
            }}
            options={[
              { value: "book", label: "Price Book" },
              { value: "custom", label: "Custom" },
            ]}
          />
          {mode === "book" ? (
            <>
              {/* The item picked and how many, on top so it's in view over a long book. */}
              {picked ? (
                <Section title="Quantity">
                  <Group>
                    <ListRow
                      title={picked.name}
                      detail={
                        <T muted style={tabular}>
                          {picked.price_cents != null
                            ? formatCents(picked.price_cents)
                            : "No price"}
                        </T>
                      }
                    />
                    <QuantityStepper
                      value={quantity}
                      onChange={setQuantity}
                      error={errors.quantity}
                    />
                  </Group>
                </Section>
              ) : null}
              <View style={[styles.search, { backgroundColor: color.fill }]}>
                <WebIcon name="search" size={20} color={color.textMuted} />
                <TextInput
                  accessibilityLabel="Search the price book"
                  placeholder="Search the price book"
                  placeholderTextColor={color.placeholder}
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  style={[type.body, { flex: 1, color: color.text, minHeight: minTap }]}
                />
              </View>
              <Section
                title="Price Book"
                footer={
                  errors.item ? (
                    <T variant="footnote" style={{ color: color.fail }}>
                      {errors.item}
                    </T>
                  ) : undefined
                }
              >
                <Group>
                  {shown.length === 0 ? (
                    <View style={styles.listRow}>
                      <T muted>Nothing matches. Add it in Settings › Price Book, or use Custom.</T>
                    </View>
                  ) : (
                    shown.map((i) => (
                      <Pressable
                        key={i.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: picked?.id === i.id }}
                        onPress={() => {
                          setPicked(i);
                          setErrors({});
                          haptics.selection();
                        }}
                        android_ripple={{ color: color.ripple }}
                        style={styles.listRow}
                      >
                        <View style={{ flex: 1 }}>
                          <T>{i.name}</T>
                          <T variant="secondary" muted>
                            {`${i.price_cents != null ? formatCents(i.price_cents) : "No price"}${
                              i.category ? ` · ${i.category}` : ""
                            }`}
                          </T>
                        </View>
                        {picked?.id === i.id ? (
                          <WebIcon name="check" size={20} color={color.link} strokeWidth={2.6} />
                        ) : null}
                      </Pressable>
                    ))
                  )}
                </Group>
              </Section>
            </>
          ) : (
            <>
              <FieldGroup title="Custom Charge" labelWidth={112}>
                <FieldRow
                  label="Description"
                  value={description}
                  onChangeText={setDescription}
                  maxLength={maxLength}
                  error={errors.description}
                />
                <FieldRow
                  label="Price ($)"
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                  placeholder="24.00"
                  error={errors.price}
                />
                <FieldRow
                  label="Quantity"
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="decimal-pad"
                  error={errors.quantity}
                />
                <Toggle inList label="Taxable" value={taxable} onChange={setTaxable} />
              </FieldGroup>
            </>
          )}
        </View>
      ) : null}
    </ModalSheet>
  );
}

/** Reports unsaved changes to the sheet it's in, so Cancel and back ask first. */
function Dirty({ dirty }: { dirty: boolean }) {
  useUnsavedChanges(dirty);
  return null;
}

/** Quantity: a number field beside − and +, starting at 1 (steppers beside a field). */
function QuantityStepper({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const n = Number(value.replace(",", "."));
  const step = (d: 1 | -1) => {
    haptics.selection();
    const base = Number.isFinite(n) ? n : 1;
    onChange(String(Math.max(1, Math.round((base + d) * 100) / 100)));
  };
  return (
    <View style={styles.stepRow}>
      <View style={styles.qtyRow}>
        <T style={{ flexShrink: 0 }}>Quantity</T>
        <TextInput
          accessibilityLabel="Quantity"
          accessibilityHint={error}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
          style={[
            type.body,
            tabular,
            styles.qtyInput,
            { color: color.text, backgroundColor: color.fill },
          ]}
        />
        <View style={{ flex: 1 }} />
        <View style={[styles.stepper, { backgroundColor: color.fill }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fewer"
            disabled={!(n > 1)}
            onPress={() => step(-1)}
            style={[styles.stepButton, !(n > 1) && { opacity: 0.4 }]}
          >
            <WebIcon name="minus" size={20} color={color.text} strokeWidth={2.2} />
          </Pressable>
          <View style={[styles.stepLine, { backgroundColor: color.separator }]} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More"
            onPress={() => step(1)}
            style={styles.stepButton}
          >
            <WebIcon name="plus" size={20} color={color.text} strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>
      {error ? (
        <T variant="secondary" style={{ color: color.fail }}>
          {error}
        </T>
      ) : null}
    </View>
  );
}

/** A charge's sheet: what it is, and Remove Charge. */
function ChargeSheet({
  charge,
  onClose,
  onRemove,
}: {
  charge: VisitCharge | null;
  onClose: () => void;
  onRemove: (c: VisitCharge) => void;
}) {
  return (
    <ModalSheet visible={!!charge} onClose={onClose} title={charge?.name ?? ""} cancel="Close">
      {charge ? (
        <View style={{ gap: space["5"] }}>
          <T muted>{`${chargeDetail(charge)} · ${formatCents(chargeCents(charge))}`}</T>
          <Button title="Remove Charge" kind="danger" wide onPress={() => onRemove(charge)} />
        </View>
      ) : null}
    </ModalSheet>
  );
}

/** Asks, then removes the charge (the website's "Remove this charge?"). */
function askRemove(companyId: string, c: VisitCharge, then?: () => void) {
  confirmDestructive({
    title: "Remove this charge?",
    confirm: "Remove Charge",
    onConfirm: () => {
      removeVisitCharge(companyId, c.id);
      then?.();
    },
  });
}

/** A maintenance visit's Charges, on its Checklist, after Regular Cleanings. */
export function VisitCharges({ job, customerName }: { job: Job; customerName: string | null }) {
  const company = useCompany();
  const items = useChargeItems(company.id);
  const charges = useVisitCharges(company.id, job.id);
  const sent = useChargesSentInvoice(company.id, charges);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<VisitCharge | null>(null);
  const locked = !!sent;
  const day =
    (job as { plan_date?: string | null }).plan_date ??
    job.scheduled_start ??
    job.completed_at ??
    new Date().toISOString();
  const footer =
    sent && !sent.known
      ? CHARGE_LOCKED
      : chargesFooter({
          firstName: customerName?.split(" ")[0] || "the customer",
          month: monthName(day, company.timezone),
          sentInvoice: sent
            ? {
                number: sent.number,
                sentOn: sent.sentAt
                  ? new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                      timeZone: company.timezone,
                    }).format(new Date(sent.sentAt))
                  : "",
              }
            : null,
        });

  return (
    <Section title="Charges" footer={footer}>
      <Group>
        {charges.map((c) =>
          locked ? (
            <ListRow
              key={c.id}
              title={c.name}
              subtitle={chargeDetail(c)}
              detail={
                <T muted style={tabular}>
                  {formatCents(chargeCents(c))}
                </T>
              }
            />
          ) : (
            <ListRow
              key={c.id}
              title={c.name}
              subtitle={chargeDetail(c)}
              detail={
                <T muted style={tabular}>
                  {formatCents(chargeCents(c))}
                </T>
              }
              onPress={() => setOpen(c)}
              // Swipe to remove; the row's sheet has Remove Charge as the visible way.
              onDelete={() => askRemove(company.id, c)}
              deleteLabel="Remove"
            />
          ),
        )}
        {locked ? null : <AddChargeRow onPress={() => setAdding(true)} />}
      </Group>
      <AddChargeSheet
        open={adding}
        items={items}
        maxLength={120}
        onClose={() => setAdding(false)}
        onAdd={(values) => {
          addVisitCharge(company.id, job.id, values);
          setAdding(false);
        }}
      />
      <ChargeSheet
        charge={open}
        onClose={() => setOpen(null)}
        onRemove={(c) => askRemove(company.id, c, () => setOpen(null))}
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  plus: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  listRow: {
    minHeight: minTap,
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    paddingHorizontal: space["4"],
    paddingVertical: 10,
  },
  search: {
    minHeight: minTap,
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    borderRadius: shape.field,
    paddingHorizontal: space["3"],
  },
  stepRow: { paddingHorizontal: space["4"], paddingVertical: space["2"], gap: 4 },
  qtyRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: space["3"] },
  qtyInput: {
    width: 72,
    minHeight: minTap,
    borderRadius: shape.field,
    paddingHorizontal: space["3"],
    textAlign: "center",
  },
  stepper: { height: 44, flexDirection: "row", alignItems: "center", borderRadius: 999 },
  stepButton: { width: 56, height: 44, alignItems: "center", justifyContent: "center" },
  stepLine: { width: 1, height: 20 },
});
