import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import {
  ACID_PRODUCTS,
  CHLORINE_PRODUCTS,
  READING_LABELS,
  additionLabel,
  additionsCents,
  calculateChemistry,
  chargesChemicals,
  chemicalCardLine,
  chemicalItems,
  chemicalRows,
  formatCents,
  formatSchedule,
  itemAddition,
  lineTotal,
  monthName,
  openSuggestions,
  readingSummary,
  stepQuantity,
  suggestionText,
  targets,
  unitPriceLabel,
  type AcidProduct,
  type AdditionDraft,
  type ChemicalAddition,
  type ChemicalItem,
  type ChlorineProduct,
  type Property,
  type ReadingKey,
  type Readings,
} from "@leakbook/core";
import {
  addChemicals,
  removeChemical,
  saveVisitReading,
  updateChemical,
  useChemicalItems,
  useChemicalLog,
  useLockedAdditions,
  useVisitAdditions,
  useVisitReading,
} from "../../data/chemicals";
import { getServices } from "../../lib/services";
import { useCompany } from "../../state/session";
import { Button, Check, Chevron, Group, Section, T, Toggle } from "../../ui/components";
import { confirmDestructive } from "../../ui/confirm";
import { haptics } from "../../ui/haptics";
import { ModalSheet, useUnsavedChanges } from "../../ui/ModalSheet";
import { Select } from "../../ui/Select";
import { color, face, MAX_TEXT_SCALE, minTap, shape, space, tabular, type } from "../../ui/theme";
import { WebIcon } from "../../ui/WebIcon";
import { Cell, withCommas } from "./Calculator";

// A visit's Chemicals, first on its Checklist and opened in place (owner, 2026-10-19 and
// 2026-10-24: "the actual reading, the aim for, the suggested chemicals to add, and what was
// actually added"; docs/design/2026-10-24-chemicals-added.md), as the website's VisitChemicals
// and the iPhone's ChemicalCard. One row per reading: Reading and Aim For, then Suggested
// (numbered in the order to add) and Added. Tapping a suggestion's circle adds it as it is; its
// text opens the Added Chemical sheet. Mark All Added; Also Added with Add Chemical. Everything
// saves as it's typed or tapped, on the phone first (no Submit on visits).

const READINGS: { key: ReadingKey; label: string }[] = [
  { key: "fc", label: "Free chlorine" },
  { key: "ph", label: "pH" },
  { key: "ta", label: "Alkalinity" },
  { key: "ch", label: "Calcium" },
  { key: "cya", label: "Stabilizer" },
  { key: "salt", label: "Salt" },
];

/** Where this phone remembers the levels the tech aims for (as the calculator). */
const GOALS_KEY = "chemicals:goals";

const num = (v: string | undefined) => {
  const n = Number((v ?? "").replace(/,/g, ""));
  return !v || v.trim() === "" || !Number.isFinite(n) ? null : n;
};
const str = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

/**
 * Large text (the phone's font size at 135% or more, as FieldRow stacks): rows stack (the name,
 * then each field full width with its own label) instead of squeezing into columns, so nothing
 * truncates or breaks mid-word.
 */
function useLargeText(): boolean {
  return useWindowDimensions().fontScale >= 1.35;
}

function rememberedGoals(): Partial<Record<ReadingKey, string>> {
  try {
    const saved = JSON.parse(getServices().kv.get(GOALS_KEY) ?? "{}");
    return saved && typeof saved === "object" ? (saved as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** What the Added Chemical sheet edits: an addition, or a suggestion before it's added. */
type Editing = { row: ChemicalAddition; isNew: boolean };

export function VisitChemicals({
  pool,
  jobId,
  customerName,
  visitDay,
}: {
  pool: Property;
  jobId: string;
  /** The customer's name, for "Billed on Rebecca’s October invoice". */
  customerName: string | null;
  /** The visit's day or start, for the month it's billed in. */
  visitDay: string | null;
}) {
  const company = useCompany();
  const large = useLargeText();
  const items = useChemicalItems(company.id);
  const additions = useVisitAdditions(company.id, jobId, items);
  const own = useVisitReading(jobId);
  const latest = useChemicalLog(company.id).find(
    (r) => r.property_id === pool.id && r.job_id !== jobId,
  );
  const lastLine = latest
    ? `Last: ${readingSummary(latest)} · ${formatSchedule(latest.recorded_at, new Date(), company.timezone)}`
    : "";
  const [open, setOpen] = useState(() => !!own || additions.length > 0);
  const [turn] = useState(() => new Animated.Value(open ? 1 : 0));
  useEffect(() => {
    Animated.timing(turn, { toValue: open ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [open, turn]);
  const [typed, setTyped] = useState("");
  // Closed: the visit's own readings, else the pool's last ones from another visit.
  const line = chemicalCardLine(typed || (own ? readingSummary(own) : "") || lastLine, additions);
  return (
    <View style={[styles.card, { backgroundColor: color.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Chemicals, ${line}`}
        onPress={() => setOpen(!open)}
        android_ripple={{ color: color.ripple }}
        style={styles.head}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={[type.body, face.semiBold, { color: color.text }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            Chemicals
          </Text>
          <Text
            numberOfLines={large ? undefined : 1}
            style={[type.secondary, tabular, { color: color.textMuted }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {line}
          </Text>
        </View>
        <Animated.View
          style={{
            transform: [
              { rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }) },
            ],
          }}
        >
          <WebIcon name="chevronDown" size={20} color={color.textMuted} strokeWidth={2.2} />
        </Animated.View>
      </Pressable>
      {open ? (
        <Body
          pool={pool}
          jobId={jobId}
          items={items}
          additions={additions}
          customerName={customerName}
          visitDay={visitDay}
          onTyped={setTyped}
        />
      ) : null}
    </View>
  );
}

function Body({
  pool,
  jobId,
  items,
  additions,
  customerName,
  visitDay,
  onTyped,
}: {
  pool: Property;
  jobId: string;
  items: ChemicalItem[];
  additions: ChemicalAddition[];
  customerName: string | null;
  visitDay: string | null;
  onTyped: (line: string) => void;
}) {
  const company = useCompany();
  const large = useLargeText();
  const charges = chargesChemicals(company.settings);
  const locked = useLockedAdditions(company.id, additions);
  // The form starts from the visit's own row, once; after that the phone's typing leads.
  const r = useVisitReading(jobId);
  const [gallonsText, setGallonsText] = useState(() =>
    withCommas(str(r?.gallons ?? (Number(pool.approx_gallons) || null))),
  );
  const [values, setValues] = useState<Partial<Record<ReadingKey, string>>>(() =>
    Object.fromEntries(READINGS.map(({ key }) => [key, str(r?.[key])])),
  );
  const [goals, setGoalsState] = useState<Partial<Record<ReadingKey, string>>>(() => {
    const own = Object.entries(r?.goals ?? {}).filter(([, v]) => v !== null && v !== undefined);
    // A visit with no Aim For of its own starts from this phone's remembered levels.
    return own.length
      ? Object.fromEntries(own.map(([k, v]) => [k, str(v as number)]))
      : rememberedGoals();
  });
  const [chlorine, setChlorine] = useState<ChlorineProduct>(r?.chlorine_product ?? "liquid12");
  const [acid, setAcid] = useState<AcidProduct>(r?.acid_product ?? "muriatic31");
  const [notes, setNotes] = useState(r?.notes ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const touched = useRef(false);
  const change =
    <V,>(set: (v: V) => void) =>
    (v: V) => {
      touched.current = true;
      set(v);
    };
  const setGoal = (key: ReadingKey, v: string) => {
    touched.current = true;
    const next = { ...goals, [key]: v };
    setGoalsState(next);
    getServices().kv.set(GOALS_KEY, JSON.stringify(next));
  };

  // Saved as typed: half a second after the last change.
  useEffect(() => {
    if (!touched.current) return;
    const t = setTimeout(() => {
      setProblem(
        saveVisitReading({
          companyId: company.id,
          jobId,
          pool,
          gallons: gallonsText,
          readings: values,
          goals,
          chlorine,
          acid,
          notes,
        }),
      );
    }, 500);
    return () => clearTimeout(t);
  }, [company.id, jobId, pool, gallonsText, values, goals, chlorine, acid, notes]);

  const readings: Readings = Object.fromEntries(READINGS.map(({ key }) => [key, num(values[key])]));
  const typedLine = readingSummary(readings);
  useEffect(() => onTyped(typedLine), [onTyped, typedLine]);
  const goalLevels = Object.fromEntries(
    Object.entries(goals).map(([k, v]) => [k, num(v)]),
  ) as Partial<Record<ReadingKey, number | null>>;
  const gallons = num(gallonsText) ?? 0;
  const result = calculateChemistry({ gallons, readings, chlorine, acid, goals: goalLevels });
  const ready = gallons > 0 && result.statuses.length > 0;
  const { rows, extras } = chemicalRows(
    ready ? result : { ...result, steps: [] },
    additions,
    items,
  );
  const unadded = openSuggestions(rows);
  const recommended = targets(readings.cya);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [picking, setPicking] = useState(false);
  const firstName = customerName?.split(" ")[0] || "the customer";
  const month = monthName(visitDay ?? new Date().toISOString(), company.timezone);

  const add = (
    drafts: AdditionDraft[],
    extra?: { customer_supplied?: boolean; note?: string | null },
  ) => {
    addChemicals(company.id, jobId, pool.id, drafts, additions.length, extra);
    haptics.success();
  };
  const remove = (a: ChemicalAddition) => {
    removeChemical(company.id, a.id);
    haptics.selection();
  };
  const draftRow = (d: AdditionDraft): ChemicalAddition => ({
    ...d,
    id: "",
    job_id: jobId,
    property_id: pool.id,
    customer_supplied: false,
    note: null,
    added_at: "",
    sort_order: additions.length,
  });

  const addedRow = (a: ChemicalAddition) => {
    const isLocked = locked.has(a.id);
    return (
      <View key={a.id} style={styles.addRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${additionLabel(a)}`}
          accessibilityState={{ disabled: isLocked }}
          disabled={isLocked}
          onPress={() => remove(a)}
          style={[styles.checkTap, isLocked && { opacity: 0.6 }]}
        >
          <Check done />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityHint={isLocked ? "On a sent invoice" : "Changes the amount or the chemical"}
          onPress={() => setEditing({ row: a, isNew: false })}
          style={styles.addText}
        >
          <View style={{ flex: 1 }}>
            <T variant="footnote" style={[face.semiBold, { color: color.pass }]}>
              {a.customer_supplied ? "Added · customer supplied" : "Added"}
            </T>
            <T variant="bodyEmphasis">{additionLabel(a)}</T>
            {large && charges && !a.customer_supplied ? <Price cents={lineTotal(a)} /> : null}
          </View>
          {!large && charges && !a.customer_supplied ? <Price cents={lineTotal(a)} /> : null}
          <Chevron />
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[styles.body, { borderTopColor: color.separator }]}>
      <View style={large ? styles.stacked : styles.gallons}>
        <T variant="bodyMedium" style={large ? undefined : { flex: 1 }}>
          Gallons
        </T>
        <View style={large ? undefined : { width: 150 }}>
          <Cell
            accessibilityLabel="Gallons"
            keyboardType="number-pad"
            value={gallonsText}
            onChangeText={(v) => change(setGallonsText)(withCommas(v))}
            placeholder="20,000"
            style={{ width: "100%", paddingRight: large ? 96 : 48 }}
          />
          <Text
            style={[type.secondary, styles.unit, { color: color.textMuted }]}
            pointerEvents="none"
          >
            gal
          </Text>
        </View>
      </View>
      {/* Stacked rows (large text) label each field instead. */}
      {large ? (
        <View style={[styles.dividerTop, { borderTopColor: color.separator }]} />
      ) : (
        <View style={[styles.columns, { borderTopColor: color.separator }]}>
          <View style={{ flex: 1 }} />
          <Text
            style={[styles.colLabel, { color: color.textMuted }]}
            importantForAccessibility="no"
          >
            Reading
          </Text>
          <Text
            style={[styles.colLabel, { color: color.textMuted }]}
            importantForAccessibility="no"
          >
            Aim For
          </Text>
        </View>
      )}
      {rows.map((row, i) => {
        const status = result.statuses.find((s) => s.key === row.key);
        const target = recommended[row.key]?.target;
        const label = READINGS.find((x) => x.key === row.key)!.label;
        const word = !status
          ? "Not tested"
          : status.status === "ok"
            ? "In range"
            : status.status === "low"
              ? "Low"
              : "High";
        return (
          <View
            key={row.key}
            style={[
              styles.reading,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth },
              { borderTopColor: color.separator },
            ]}
          >
            <View style={large ? styles.stacked : styles.readingTop}>
              <View style={large ? styles.nameLine : { flex: 1 }} accessible>
                <T variant="bodyMedium">{label}</T>
                <T
                  variant="secondary"
                  style={[
                    status && face.semiBold,
                    {
                      color: !status
                        ? color.textMuted
                        : status.status === "ok"
                          ? color.pass
                          : color.warning,
                    },
                  ]}
                >
                  {word}
                </T>
              </View>
              <Labeled title="Reading" large={large}>
                <Cell
                  accessibilityLabel={`${READING_LABELS[row.key]} reading`}
                  value={values[row.key] ?? ""}
                  onChangeText={(v) => change(setValues)({ ...values, [row.key]: v })}
                  style={large ? styles.wide : undefined}
                />
              </Labeled>
              <Labeled title="Aim For" large={large}>
                <Cell
                  accessibilityLabel={`${READING_LABELS[row.key]}: aim for (recommended ${target})`}
                  placeholder={String(target)}
                  value={goals[row.key] ?? ""}
                  onChangeText={(v) => setGoal(row.key, v)}
                  style={large ? styles.wide : undefined}
                />
              </Labeled>
            </View>
            {row.step || row.added.length ? (
              <View style={[styles.well, { backgroundColor: color.well }]}>
                {row.step ? (
                  <>
                    <View style={large ? styles.stackedTight : styles.suggested} accessible>
                      <View style={styles.suggested}>
                        {row.order ? (
                          <View style={[styles.order, { backgroundColor: color.primary }]}>
                            <Text style={[styles.orderText, { color: color.onPrimary }]}>
                              {row.order}
                            </Text>
                          </View>
                        ) : null}
                        <T variant="secondary" muted>
                          Suggested
                        </T>
                      </View>
                      <T
                        variant="secondary"
                        style={[face.medium, styles.suggestion, large && { textAlign: "left" }]}
                      >
                        {suggestionText(row.step)}
                      </T>
                    </View>
                    {row.step.note && row.key === "ph" ? (
                      <T variant="secondary" muted>
                        Acid to water, never water to acid.
                      </T>
                    ) : row.step.note && !row.suggestion ? (
                      <T variant="secondary" muted>
                        {row.step.note}
                      </T>
                    ) : null}
                  </>
                ) : null}
                <View style={[styles.wellRows, { borderTopColor: color.separator }]}>
                  {row.added.map(addedRow)}
                  {row.added.length === 0 && row.suggestion ? (
                    <View style={styles.addRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Mark added: ${additionLabel(row.suggestion)}`}
                        onPress={() => add([row.suggestion!])}
                        style={styles.checkTap}
                      >
                        <Check done={false} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityHint="Change the amount before adding it"
                        onPress={() => setEditing({ row: draftRow(row.suggestion!), isNew: true })}
                        style={styles.addText}
                      >
                        <View style={{ flex: 1 }}>
                          <T variant="footnote" muted>
                            Not added yet
                          </T>
                          <T muted>{additionLabel(row.suggestion)}</T>
                          {large && charges ? <Price cents={lineTotal(row.suggestion)} /> : null}
                        </View>
                        {!large && charges ? <Price cents={lineTotal(row.suggestion)} /> : null}
                        <Chevron />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
      <T variant="secondary" muted>
        Numbers are the order to add them. Aim For starts at the recommended level.
      </T>
      {problem ? (
        <T variant="secondary" style={{ color: color.fail }}>
          {problem}
        </T>
      ) : null}
      {unadded.length ? (
        <Button title="Mark All Added" kind="secondary" wide onPress={() => add(unadded)} />
      ) : null}

      <Section title="Also Added">
        <Group style={{ backgroundColor: color.well }}>
          {[
            ...extras.map((a) => (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                onPress={() => setEditing({ row: a, isNew: false })}
                android_ripple={{ color: color.ripple }}
                style={styles.listRow}
              >
                <View style={{ flex: 1 }}>
                  <T variant="bodyEmphasis">{additionLabel(a)}</T>
                  {a.note || a.customer_supplied ? (
                    <T variant="secondary" muted>
                      {[a.customer_supplied ? "Customer supplied" : null, a.note]
                        .filter(Boolean)
                        .join(" · ")}
                    </T>
                  ) : null}
                  {large && charges && !a.customer_supplied ? <Price cents={lineTotal(a)} /> : null}
                </View>
                {!large && charges && !a.customer_supplied ? <Price cents={lineTotal(a)} /> : null}
                <Chevron />
              </Pressable>
            )),
            <Pressable
              key="add"
              accessibilityRole="button"
              onPress={() => setPicking(true)}
              android_ripple={{ color: color.ripple }}
              style={styles.listRow}
            >
              <View style={[styles.plus, { backgroundColor: color.link }]}>
                <WebIcon name="plus" size={16} color={color.onPrimary} strokeWidth={3} />
              </View>
              <T style={[face.medium, { color: color.link }]}>Add Chemical</T>
            </Pressable>,
          ]}
        </Group>
      </Section>

      {result.lsi !== null ? (
        <View
          style={[styles.total, large && styles.totalStacked, { borderTopColor: color.separator }]}
          accessible
        >
          <T style={large ? undefined : { flex: 1 }}>Water balance</T>
          <T muted>
            <Text style={[face.semiBold, tabular, { color: color.text }]}>
              {result.lsi > 0 ? "+" : ""}
              {result.lsi.toFixed(1)}
            </Text>{" "}
            · {result.lsiLabel}
          </T>
        </View>
      ) : null}

      <Section title="Suggestions Use">
        <View style={{ gap: space["3"] }}>
          <Select
            label="Chlorine"
            value={chlorine}
            onChange={change(setChlorine)}
            options={Object.entries(CHLORINE_PRODUCTS).map(([value, label]) => ({
              value: value as ChlorineProduct,
              label,
            }))}
          />
          <Select
            label="Acid"
            value={acid}
            onChange={change(setAcid)}
            options={Object.entries(ACID_PRODUCTS).map(([value, label]) => ({
              value: value as AcidProduct,
              label,
            }))}
          />
        </View>
      </Section>

      <View style={{ gap: 4 }}>
        <T variant="bodyMedium">Notes</T>
        <TextInput
          accessibilityLabel="Notes"
          value={notes}
          multiline
          placeholder="Anything the customer should know"
          placeholderTextColor={color.placeholder}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
          onChangeText={change(setNotes)}
          style={[
            type.body,
            styles.notes,
            { borderColor: color.controlBorder, backgroundColor: color.surface, color: color.text },
          ]}
        />
      </View>

      {charges ? (
        <View
          style={[styles.total, large && styles.totalStacked, { borderTopColor: color.separator }]}
          accessible
        >
          <T variant="bodyEmphasis" style={large ? undefined : { flex: 1 }}>
            Chemicals today
          </T>
          <T variant="bodyEmphasis" style={tabular}>
            {formatCents(additionsCents(additions))}
          </T>
        </View>
      ) : null}
      <T variant="secondary" muted>
        {charges
          ? `Saved as you go. Billed on ${firstName}’s ${month} invoice.`
          : "Saved as you go."}
      </T>

      <AddedSheet
        editing={editing}
        items={items}
        charges={charges}
        locked={!!editing && locked.has(editing.row.id)}
        onClose={() => setEditing(null)}
        onSave={(row, isNew) => {
          setEditing(null);
          if (isNew) add([row], { customer_supplied: row.customer_supplied, note: row.note });
          else updateChemical(company.id, row);
        }}
        onRemove={(row) => {
          setEditing(null);
          remove(row);
        }}
      />
      <PickSheet
        open={picking}
        items={items}
        charges={charges}
        onClose={() => setPicking(false)}
        onAdd={(draft, supplied, note) => {
          setPicking(false);
          add([draft], { customer_supplied: supplied, note });
        }}
      />
    </View>
  );
}

/** A line's price: beside it, or on its own line when stacked (large text). */
function Price({ cents }: { cents: number }) {
  return (
    <T muted style={tabular}>
      {formatCents(cents)}
    </T>
  );
}

/** A field, with its own label above it when stacked (large text); the column header otherwise. */
function Labeled({
  title,
  large,
  children,
}: {
  title: string;
  large: boolean;
  children: ReactNode;
}) {
  if (!large) return <>{children}</>;
  return (
    <View style={{ gap: 4 }}>
      <T variant="footnote" muted>
        {title}
      </T>
      {children}
    </View>
  );
}

/** The amount: a number field beside − and +, stepping by the unit (steppers beside a field). */
function Amount({
  value,
  unit,
  onChange,
  disabled = false,
}: {
  value: string;
  unit: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const large = useLargeText();
  const n = num(value) ?? 0;
  const step = (d: 1 | -1) => {
    haptics.selection();
    onChange(String(stepQuantity(n, unit, d)));
  };
  return (
    <View style={[large ? styles.stackedRow : styles.listRow, { minHeight: 56 }]}>
      <View style={large ? undefined : { width: 130 }}>
        <Cell
          accessibilityLabel="Amount"
          value={value}
          editable={!disabled}
          onChangeText={onChange}
          style={{ width: "100%", paddingRight: large ? 96 : 48 }}
        />
        <Text
          style={[type.secondary, styles.unit, { color: color.textMuted }]}
          pointerEvents="none"
        >
          {unit}
        </Text>
      </View>
      {large ? null : <View style={{ flex: 1 }} />}
      <View
        style={[
          styles.stepper,
          large && { alignSelf: "flex-end" },
          { backgroundColor: color.fill },
          disabled && { opacity: 0.5 },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Less"
          disabled={disabled}
          onPress={() => step(-1)}
          style={styles.stepButton}
        >
          <WebIcon name="minus" size={20} color={color.text} strokeWidth={2.2} />
        </Pressable>
        <View style={[styles.stepLine, { backgroundColor: color.separator }]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More"
          disabled={disabled}
          onPress={() => step(1)}
          style={styles.stepButton}
        >
          <WebIcon name="plus" size={20} color={color.text} strokeWidth={2.2} />
        </Pressable>
      </View>
    </View>
  );
}

/** An added chemical's note: one line, at most 200 characters. */
function NoteRow({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const large = useLargeText();
  return (
    <View style={large ? styles.stackedRow : styles.listRow}>
      <T>Note</T>
      <TextInput
        accessibilityLabel="Note"
        value={value}
        editable={!disabled}
        maxLength={200}
        placeholder="Optional"
        placeholderTextColor={color.placeholder}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
        onChangeText={onChange}
        style={[
          type.body,
          styles.noteInput,
          large && { textAlign: "left", alignSelf: "stretch" },
          { color: color.textMuted },
        ]}
      />
    </View>
  );
}

/** Added Chemical: another chemical, the amount, Customer Supplied, a note, or Remove. */
function AddedSheet(props: {
  editing: Editing | null;
  items: ChemicalItem[];
  charges: boolean;
  locked: boolean;
  onClose: () => void;
  onSave: (row: ChemicalAddition, isNew: boolean) => void;
  onRemove: (row: ChemicalAddition) => void;
}) {
  // A fresh form for each chemical opened (its fields start from that chemical).
  const e = props.editing;
  return <AddedSheetForm key={e ? e.row.id || `new:${e.row.reading_key}` : "none"} {...props} />;
}

function AddedSheetForm({
  editing,
  items,
  charges,
  locked,
  onClose,
  onSave,
  onRemove,
}: {
  editing: Editing | null;
  items: ChemicalItem[];
  charges: boolean;
  locked: boolean;
  onClose: () => void;
  onSave: (row: ChemicalAddition, isNew: boolean) => void;
  onRemove: (row: ChemicalAddition) => void;
}) {
  const row = editing?.row;
  const isNew = !!editing?.isNew;
  const list = chemicalItems(items);
  const [itemId, setItemId] = useState(row?.price_book_item_id ?? "");
  const item = list.find((i) => i.id === itemId);
  const unit = item?.unit ?? row?.unit ?? "";
  const [qty, setQty] = useState(row ? String(row.quantity) : "");
  const [supplied, setSupplied] = useState(!!row?.customer_supplied);
  const [note, setNote] = useState(row?.note ?? "");
  const quantity = num(qty);
  const price = item?.price_cents ?? row?.unit_price_cents ?? 0;
  const valid = quantity !== null && quantity > 0 && quantity <= 100_000;
  const dirty =
    !!row &&
    !locked &&
    (itemId !== (row.price_book_item_id ?? "") ||
      quantity !== row.quantity ||
      supplied !== row.customer_supplied ||
      note !== (row.note ?? ""));
  const save = () => {
    if (!row || !valid || locked) return;
    onSave(
      {
        ...row,
        price_book_item_id: item?.id ?? row.price_book_item_id,
        name: item?.name ?? row.name,
        unit,
        quantity: quantity!,
        unit_price_cents: price,
        customer_supplied: supplied,
        note: note.trim() || null,
      },
      isNew,
    );
  };
  const options = [
    // The chemical as it was added, when the price book no longer has it.
    ...(item || !row ? [] : [{ value: itemId, label: row.name }]),
    ...list.map((i) => ({
      value: i.id,
      label: charges ? `${i.name} (${unitPriceLabel(i.price_cents, i.unit)})` : i.name,
    })),
  ];
  return (
    <ModalSheet
      visible={!!editing}
      onClose={onClose}
      title={isNew ? "Add Chemical" : "Added Chemical"}
      cancel={locked ? "Close" : "Cancel"}
      done={
        row && !locked
          ? { label: isNew ? "Add" : "Save", onPress: save, disabled: !valid }
          : undefined
      }
    >
      {row ? (
        <View style={{ gap: space["5"] }}>
          <Dirty dirty={dirty} />
          <Section title="Chemical">
            <Select
              label=""
              value={itemId}
              onChange={setItemId}
              options={options}
              disabled={locked}
            />
          </Section>
          <Section
            title="Amount"
            footer={
              locked
                ? "This chemical is on a sent invoice. Change the invoice instead."
                : charges && quantity
                  ? supplied
                    ? "Customer supplied: on the report, not billed."
                    : `${additionLabel({ quantity, unit, name: "" }).trim()} × ${formatCents(price)} = ${formatCents(lineTotal({ quantity, unit_price_cents: price }))}, on the monthly invoice.`
                  : undefined
            }
          >
            <Group>
              <Amount value={qty} unit={unit} onChange={setQty} disabled={locked} />
              <ToggleRow
                label="Customer Supplied"
                value={supplied}
                onChange={setSupplied}
                disabled={locked}
              />
              <NoteRow value={note} onChange={setNote} disabled={locked} />
            </Group>
          </Section>
          {!isNew && !locked ? (
            <Button
              title="Remove Chemical"
              kind="danger"
              wide
              onPress={() =>
                confirmDestructive({
                  title: "Remove this chemical?",
                  message: "It comes off the visit and its report.",
                  confirm: "Remove Chemical",
                  onConfirm: () => onRemove(row),
                })
              }
            />
          ) : null}
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

/** Customer Supplied: the switch, held still on a sent invoice. */
function ToggleRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <View pointerEvents={disabled ? "none" : "auto"} style={disabled && { opacity: 0.6 }}>
      <Toggle inList label={label} value={value} onChange={onChange} />
    </View>
  );
}

/** Add Chemical: the shop's chemicals with search, then the amount. */
function PickSheet(props: {
  open: boolean;
  items: ChemicalItem[];
  charges: boolean;
  onClose: () => void;
  onAdd: (draft: AdditionDraft, supplied: boolean, note: string | null) => void;
}) {
  // A fresh form each time it opens.
  return <PickSheetForm key={props.open ? "open" : "closed"} {...props} />;
}

function PickSheetForm({
  open,
  items,
  charges,
  onClose,
  onAdd,
}: {
  open: boolean;
  items: ChemicalItem[];
  charges: boolean;
  onClose: () => void;
  onAdd: (draft: AdditionDraft, supplied: boolean, note: string | null) => void;
}) {
  const list = chemicalItems(items);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ChemicalItem | null>(null);
  const [qty, setQty] = useState("1");
  const [supplied, setSupplied] = useState(false);
  const [note, setNote] = useState("");
  const shown = list.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()));
  const quantity = num(qty);
  const valid = picked !== null && quantity !== null && quantity > 0 && quantity <= 100_000;
  const add = () => {
    if (!picked || quantity === null || !valid) return;
    onAdd(itemAddition(picked, quantity), supplied, note.trim() || null);
  };
  return (
    <ModalSheet
      visible={open}
      onClose={onClose}
      title="Add Chemical"
      done={open ? { label: "Add", onPress: add, disabled: !valid } : undefined}
    >
      {open ? (
        <View style={{ gap: space["5"] }}>
          <Dirty dirty={picked !== null} />
          {picked ? (
            <Section
              title="Amount"
              footer={
                charges && quantity
                  ? supplied
                    ? "Customer supplied: on the report, not billed."
                    : `${formatCents(lineTotal({ quantity, unit_price_cents: picked.price_cents }))}, on the monthly invoice.`
                  : undefined
              }
            >
              <Group>
                <View style={styles.listRow}>
                  <T variant="bodyEmphasis" style={{ flex: 1 }}>
                    {picked.name}
                  </T>
                  {charges ? (
                    <T muted style={tabular}>
                      {unitPriceLabel(picked.price_cents, picked.unit)}
                    </T>
                  ) : null}
                </View>
                <Amount value={qty} unit={picked.unit} onChange={setQty} />
                <Toggle inList label="Customer Supplied" value={supplied} onChange={setSupplied} />
                <NoteRow value={note} onChange={setNote} />
              </Group>
            </Section>
          ) : null}
          <View style={[styles.search, { backgroundColor: color.fill }]}>
            <WebIcon name="search" size={20} color={color.textMuted} />
            <TextInput
              accessibilityLabel="Search chemicals"
              placeholder="Search chemicals"
              placeholderTextColor={color.placeholder}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              style={[type.body, { flex: 1, color: color.text, minHeight: minTap }]}
            />
          </View>
          <Section title="Chemicals">
            <Group>
              {shown.length
                ? shown.map((i) => (
                    <Pressable
                      key={i.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: picked?.id === i.id }}
                      onPress={() => {
                        setPicked(i);
                        setQty(String(itemAddition(i).quantity));
                        haptics.selection();
                      }}
                      android_ripple={{ color: color.ripple }}
                      style={styles.listRow}
                    >
                      <View style={{ flex: 1 }}>
                        <T>{i.name}</T>
                        {charges ? (
                          <T variant="secondary" muted>
                            {unitPriceLabel(i.price_cents, i.unit)}
                          </T>
                        ) : null}
                      </View>
                      {picked?.id === i.id ? (
                        <WebIcon name="check" size={20} color={color.link} strokeWidth={2.6} />
                      ) : null}
                    </Pressable>
                  ))
                : [
                    <View key="none" style={styles.listRow}>
                      <T muted>No chemicals match. Add them in Settings › Price Book.</T>
                    </View>,
                  ]}
            </Group>
          </Section>
        </View>
      ) : null}
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: shape.grouped, overflow: "hidden" },
  head: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    paddingHorizontal: space["4"],
    paddingVertical: space["2"],
  },
  body: {
    gap: space["3"],
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space["4"],
    paddingTop: space["3"],
    paddingBottom: space["5"],
  },
  gallons: { flexDirection: "row", alignItems: "center", gap: space["3"], minHeight: minTap },
  // Large text: each part on its own line, fields full width.
  stacked: { gap: space["2"] },
  stackedTight: { gap: 4 },
  stackedRow: { gap: space["2"], paddingHorizontal: space["4"], paddingVertical: 10 },
  nameLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: space["2"],
  },
  wide: { width: "100%" },
  dividerTop: { borderTopWidth: StyleSheet.hairlineWidth },
  totalStacked: { flexDirection: "column", alignItems: "flex-start", gap: 2 },
  unit: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    textAlignVertical: "center",
    lineHeight: 44,
  },
  columns: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space["3"],
  },
  colLabel: { ...face.semiBold, fontSize: 13, lineHeight: 18, width: 80, textAlign: "right" },
  reading: { paddingVertical: space["3"], gap: 10 },
  readingTop: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  well: { borderRadius: shape.block, paddingHorizontal: space["3"], paddingTop: space["2"] },
  suggested: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  suggestion: { flex: 1, textAlign: "right", color: color.text },
  order: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  orderText: { ...face.bold, fontSize: 12, lineHeight: 14 },
  wellRows: { marginTop: space["2"], borderTopWidth: StyleSheet.hairlineWidth },
  addRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  checkTap: {
    width: 44,
    height: 48,
    marginLeft: -8,
    alignItems: "center",
    justifyContent: "center",
  },
  addText: { flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", gap: space["2"] },
  listRow: {
    minHeight: minTap,
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    paddingHorizontal: space["4"],
    paddingVertical: 10,
  },
  plus: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  total: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space["3"],
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space["4"],
    minHeight: minTap,
  },
  notes: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: shape.field,
    paddingHorizontal: 12,
    paddingVertical: 8,
    textAlignVertical: "top",
  },
  noteInput: { flex: 1, minHeight: minTap, textAlign: "right" },
  stepper: { height: 44, flexDirection: "row", alignItems: "center", borderRadius: 999 },
  stepButton: { width: 56, height: 44, alignItems: "center", justifyContent: "center" },
  stepLine: { width: 1, height: 20 },
  search: {
    minHeight: minTap,
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    borderRadius: shape.field,
    paddingHorizontal: space["3"],
  },
});
