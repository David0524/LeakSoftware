import { useState } from "react";
import { Text } from "react-native";
import { companyServices, formatCents, parseDollars, type ComponentType } from "@leakbook/core";
import { confirmDestructive } from "../../ui/confirm";
import { removeConfig, saveConfig, toInt, useConfig } from "../../data/config";
import { useCompany } from "../../state/session";
import { Empty, FieldGroup, FieldRow, Group, ListRow, Section, Toggle } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { Select } from "../../ui/Select";
import { color, MAX_TEXT_SCALE, tabular, type } from "../../ui/theme";
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
  const what = {
    pool: "Cleanings, chemicals, and repairs techs pick from when quoting extra work.",
    leak: "Detection fees and repairs techs pick from when building a quote.",
    both: "Detection fees, cleanings, chemicals, and repairs techs pick from when building a quote.",
  }[companyServices(company.settings)];
  const groups = new Map<string, PriceItem[]>();
  for (const item of items) {
    const key = item.category?.trim() ?? "";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const sections = [...groups.entries()].sort(([a], [b]) => Number(a === "") - Number(b === ""));
  const titled = sections.length > 1 || (sections[0] && sections[0][0] !== "");

  return (
    <>
      <SettingsList
        title="Price Book"
        subtitle={`${what} Prices are suggestions; a tech can adjust within the discount limit.`}
        addLabel="Add Item"
        onAdd={() => sheet.open("new")}
        notice={sheet.notice}
      >
        {items.length === 0 ? <Empty>No items yet.</Empty> : null}
        {sections.map(([category, rows]) => (
          <Section key={category} title={titled ? category || "Other items" : ""}>
            <Group>
              {rows.map((item) => (
                <ListRow
                  key={item.id}
                  title={item.name}
                  subtitle={item.active ? undefined : "Hidden"}
                  onPress={() => sheet.open(item)}
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
                      <Text style={{ color: color.text }}>{formatCents(item.price_cents)}</Text> /{" "}
                      {item.unit}
                    </Text>
                  }
                />
              ))}
            </Group>
          </Section>
        ))}
      </SettingsList>
      <EditSheet
        open={sheet.editing != null}
        title={sheet.editing === "new" ? "Add Item" : (sheet.editing?.name ?? "")}
        onClose={sheet.close}
      >
        <ItemForm
          item={sheet.editing === "new" ? undefined : (sheet.editing ?? undefined)}
          types={types}
          onDone={sheet.done}
        />
      </EditSheet>
    </>
  );
}

function ItemForm({
  item,
  types,
  onDone,
}: {
  item?: PriceItem;
  types: ComponentType[];
  onDone: (message: string) => void;
}) {
  const company = useCompany();
  const [f, setF] = useState({
    name: item?.name ?? "",
    price: item ? (item.price_cents / 100).toFixed(2) : "",
    unit: item?.unit ?? "each",
    category: item?.category ?? "",
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
    setErrors(e);
    if (Object.keys(e).length) return;
    saveConfig("price_book_item", company.id, item?.id ?? null, {
      name: f.name.trim(),
      description: f.description.trim() || null,
      category: f.category.trim() || null,
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
        <FieldRow label="Category" value={f.category} onChangeText={set("category")} />
        <FieldRow
          label="Order"
          value={f.order}
          onChangeText={set("order")}
          keyboardType="number-pad"
        />
      </FieldGroup>
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
