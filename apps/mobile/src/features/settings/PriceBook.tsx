import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  CHARGE_CHEMICALS_TEXT,
  CHEMICALS_CATEGORY,
  OTHER_CATEGORY,
  PRICE_BOOK_TEXT,
  chargeChemicalsSettings,
  chargesChemicals,
  companyServices,
  formatCents,
  localDate,
  offersPool,
  parseDollars,
  priceBookCategory,
  priceBookCategoryChoices,
  priceBookCategoryStart,
  priceBookSections,
  type ComponentType,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { getServices } from "../../lib/services";
import { confirmDestructive } from "../../ui/confirm";
import { removeConfig, saveConfig, toInt, useConfig } from "../../data/config";
import { useCompany } from "../../state/session";
import {
  Empty,
  FieldGroup,
  FieldRow,
  Group,
  ListRow,
  Section,
  T,
  Toggle,
} from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { Select } from "../../ui/Select";
import { color, MAX_TEXT_SCALE, minTap, space, tabular, type } from "../../ui/theme";
import { WebIcon } from "../../ui/WebIcon";
import { useRowMenu } from "../../ui/RowMenu";
import { EditSheet, FormActions, ManagersOnly, SettingsList, useEditSheet } from "./SettingsList";
import { formChanged } from "../../lib/discard";
import { priceItemErrors } from "../../lib/limits";
import { useUnsavedChanges } from "../../ui/ModalSheet";

interface PriceItem {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  component_type_key: string | null;
  unit: string;
  price_cents: number;
  taxable: boolean;
  sort_order: number;
  active: boolean;
}

/** Settings › Price Book (the website's settings/price-book), grouped by category. */
export function PriceBook() {
  return (
    <ManagersOnly title="Price Book">
      <PriceBookPage />
    </ManagersOnly>
  );
}

function PriceBookPage() {
  const company = useCompany();
  const items = useConfig<PriceItem>("price_book_item", company.id);
  const types = useConfig<ComponentType>("component_type", company.id);
  const sheet = useEditSheet<PriceItem>();
  // Touch and hold a row for Edit and its delete (gestures spec section 12).
  const menu = useRowMenu();
  const what = {
    pool: "Cleanings, chemicals, and repairs techs pick from when quoting extra work.",
    leak: "Detection fees and repairs techs pick from when building a quote.",
    both: "Detection fees, cleanings, chemicals, and repairs techs pick from when building a quote.",
  }[companyServices(company.settings)];
  // Chemicals first, uncategorized items last (owner, 2026-10-25), as on the website.
  const pool = offersPool(company.settings);
  const sections = priceBookSections(items);
  const categories = priceBookCategoryChoices(items, pool);
  const titled = sections.length > 1 || (sections[0] && sections[0].category !== "");
  const rowsOf = (rows: PriceItem[]) =>
    rows.map((item) => (
      <ListRow
        key={item.id}
        title={item.name}
        subtitle={item.active ? undefined : "Hidden"}
        onPress={() => sheet.open(item)}
        editMenu={{ menu, title: item.name }}
        // Swipe to remove; the row's sheet keeps its visible Remove button.
        deleteLabel="Remove Item"
        onDelete={() =>
          confirmDestructive({
            title: "Remove this item from the price book?",
            confirm: "Remove Item",
            onConfirm: () => removeConfig("price_book_item", company.id, item.id),
          })
        }
        detail={
          <Text
            style={[type.body, tabular, { color: color.textMuted }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            <Text style={{ color: color.text }}>{formatCents(item.price_cents)}</Text> / {item.unit}
          </Text>
        }
      />
    ));

  return (
    <>
      <SettingsList
        title="Price Book"
        subtitle={`${what} Prices are suggestions; a tech can adjust within the discount limit.`}
        addLabel="Add Item"
        onAdd={() => sheet.open("new")}
        notice={sheet.notice}
      >
        {/* Charge for Chemicals (owner, 2026-10-24) sits with the prices it uses, in the
            Chemicals group, as on the website. Only owners and admins reach this page. */}
        {pool && !sections.some((x) => x.category === CHEMICALS_CATEGORY) ? (
          <ChargeChemicals />
        ) : null}
        {items.length === 0 ? <Empty>No items yet.</Empty> : null}
        {sections.map(({ category, items: rows }) =>
          category === CHEMICALS_CATEGORY ? (
            <ChemicalsGroup key={category} showSwitch={pool} count={rows.length}>
              {rowsOf(rows)}
            </ChemicalsGroup>
          ) : (
            <Section key={category} title={titled ? category || PRICE_BOOK_TEXT.uncategorized : ""}>
              <Group>{rowsOf(rows)}</Group>
            </Section>
          ),
        )}
      </SettingsList>
      {menu.element}
      <EditSheet
        open={sheet.editing != null}
        title={sheet.editing === "new" ? "Add Item" : (sheet.editing?.name ?? "")}
        onClose={sheet.close}
      >
        <ItemForm
          item={sheet.editing === "new" ? undefined : (sheet.editing ?? undefined)}
          types={types}
          categories={categories}
          onDone={sheet.done}
        />
      </EditSheet>
    </>
  );
}

/**
 * Settings › Price Book › Charge for Chemicals: a switch that saves when flipped, through sync,
 * with what on and off mean under it (website components/charge-chemicals.tsx). Turning it on
 * records the month it starts, so earlier months are never billed.
 */
function ChargeChemicals() {
  const company = useCompany();
  const on = chargesChemicals(company.settings);
  return (
    <Section title="Chemicals" footer={on ? CHARGE_CHEMICALS_TEXT.on : CHARGE_CHEMICALS_TEXT.off}>
      <Group>
        <ChargeChemicalsToggle />
      </Group>
    </Section>
  );
}

function ChargeChemicalsToggle({ onChange }: { onChange?: (on: boolean) => void }) {
  const company = useCompany();
  const on = chargesChemicals(company.settings);
  return (
    <Toggle
      inList
      label={CHARGE_CHEMICALS_TEXT.label}
      value={on}
      onChange={(next) => {
        // Already on: it keeps the month it started.
        if (next === on) return;
        const today = localDate(new Date(), company.timezone);
        getServices().sync.write("company", company.id, company.id, {
          settings: {
            ...(company.settings as unknown as Record<string, JsonValue>),
            ...(chargeChemicalsSettings(next, today) as Record<string, JsonValue>),
          },
        });
        haptics.selection();
        onChange?.(next);
      }}
    />
  );
}

/**
 * The Chemicals group, first in the price book (owner, 2026-10-25: "move chemicals to the top
 * and as a dropdown, minimized if charge for chemicals is turned off"): its header is a
 * disclosure with the item count, open when the shop charges for chemicals and collapsed when
 * it doesn't; tapping it opens or closes it either way. Charge for Chemicals stays in view, and
 * flipping it opens or collapses the items to match (website components/price-book.tsx).
 */
function ChemicalsGroup({
  showSwitch,
  count,
  children,
}: {
  showSwitch: boolean;
  count: number;
  children: ReactNode;
}) {
  const company = useCompany();
  const on = chargesChemicals(company.settings);
  const [open, setOpen] = useState(on);
  return (
    <View style={styles.section} testID="price-chemicals">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Chemicals, ${count}`}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          haptics.selection();
          setOpen(!open);
        }}
        style={({ pressed }) => [styles.head, pressed && { opacity: 0.6 }]}
      >
        <T variant="sectionLabel">Chemicals</T>
        <T variant="sectionLabel" style={tabular}>
          {count}
        </T>
        <View style={{ flex: 1 }} />
        <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
          <WebIcon name="chevronRight" size={16} color={color.textMuted} strokeWidth={2.4} />
        </View>
      </Pressable>
      {showSwitch || open ? (
        <Group>
          {showSwitch ? <ChargeChemicalsToggle onChange={setOpen} /> : null}
          {open ? children : null}
        </Group>
      ) : null}
      {showSwitch ? (
        <View style={styles.footer}>
          <T variant="footnote" muted>
            {on ? CHARGE_CHEMICALS_TEXT.on : CHARGE_CHEMICALS_TEXT.off}
          </T>
        </View>
      ) : null}
    </View>
  );
}

function ItemForm({
  item,
  types,
  categories,
  onDone,
}: {
  item?: PriceItem;
  types: ComponentType[];
  categories: string[];
  onDone: (message: string) => void;
}) {
  const company = useCompany();
  // The category is a choice of the shop's categories and Other, which takes a new one; left
  // blank, it's filed under Other (owner, 2026-10-25).
  const startCategory = priceBookCategoryStart(item?.category, categories);
  const [f, setF] = useState({
    name: item?.name ?? "",
    price: item ? (item.price_cents / 100).toFixed(2) : "",
    unit: item?.unit ?? "each",
    category: startCategory.choice,
    customCategory: startCategory.custom,
    component: item?.component_type_key ?? "",
    order: String(item?.sort_order ?? 0),
    description: item?.description ?? "",
    taxable: item ? item.taxable : true,
    active: item ? item.active : true,
  });
  // Unsaved entries ask before closing (owner, 2026-10-20: "Discard changes?" everywhere).
  const [startF] = useState(f);
  useUnsavedChanges(formChanged(startF, f));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  function save() {
    const price = parseDollars(f.price);
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "Enter a name.";
    if (price === null || price < 0) e.price = "Enter a price, like 185 or 185.50.";
    // The website's limits (owner, 2026-10-20).
    Object.assign(e, priceItemErrors(f.name, f.unit));
    if (f.category === OTHER_CATEGORY && f.customCategory.trim().length > 60) {
      e.customCategory = "Keep the category under 60 characters.";
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    saveConfig("price_book_item", company.id, item?.id ?? null, {
      name: f.name.trim(),
      description: f.description.trim() || null,
      category: priceBookCategory(f.category, f.customCategory),
      component_type_key: f.component || null,
      unit: f.unit.trim() || "each",
      price_cents: price!,
      taxable: f.taxable,
      sort_order: toInt(f.order),
      active: item ? f.active : true,
    });
    haptics.success();
    onDone(item ? "Saved." : `Added ${f.name.trim()}.`);
  }

  return (
    <>
      <FieldGroup labelWidth={120}>
        <FieldRow label="Name" value={f.name} onChangeText={set("name")} error={errors.name} />
        <FieldRow
          label="Price ($)"
          value={f.price}
          onChangeText={set("price")}
          keyboardType="decimal-pad"
          error={errors.price}
        />
        <FieldRow label="Unit" value={f.unit} onChangeText={set("unit")} error={errors.unit} />
        <FieldRow
          label="Order"
          value={f.order}
          onChangeText={set("order")}
          keyboardType="number-pad"
        />
      </FieldGroup>
      <Select
        label={PRICE_BOOK_TEXT.category}
        value={f.category}
        onChange={set("category")}
        options={categories.map((c) => ({ value: c, label: c }))}
      />
      {f.category === OTHER_CATEGORY ? (
        <FieldGroup labelWidth={120}>
          <FieldRow
            label={PRICE_BOOK_TEXT.newCategory}
            value={f.customCategory}
            onChangeText={set("customCategory")}
            placeholder={PRICE_BOOK_TEXT.newCategoryPlaceholder}
            maxLength={60}
            error={errors.customCategory}
          />
        </FieldGroup>
      ) : null}
      <Select
        label="Suggest for"
        value={f.component}
        onChange={set("component")}
        options={[
          { value: "", label: "Any finding" },
          ...types.map((t) => ({ value: t.key, label: t.name })),
        ]}
      />
      <FieldGroup footer="Shown on quotes.">
        <FieldRow
          label="Description"
          value={f.description}
          onChangeText={set("description")}
          multiline
        />
      </FieldGroup>
      <Group>
        <Toggle
          inList
          label="Taxable"
          value={f.taxable}
          onChange={(v) => setF({ ...f, taxable: v })}
        />
        {item ? (
          <Toggle
            inList
            label="Available on quotes"
            value={f.active}
            onChange={(v) => setF({ ...f, active: v })}
          />
        ) : null}
      </Group>
      <FormActions
        submit={item ? "Save Item" : "Add Item"}
        onSubmit={save}
        remove={
          item
            ? {
                label: "Remove Item",
                confirm: "Remove this item from the price book?",
                onConfirm: () => {
                  removeConfig("price_book_item", company.id, item.id);
                  onDone("Removed.");
                },
              }
            : undefined
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: space["2"] },
  head: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: minTap },
  footer: { paddingHorizontal: space["4"] },
});
