import type { Metadata } from "next";
import { formatCents } from "@leakbook/core";
import { removeConfigRow, savePriceItem } from "@/app/actions/settings";
import { SField, SettingsForm } from "@/components/settings-forms";
import { Card, Checkbox, Empty, PageHeader, Select } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { listConfig, type ComponentType } from "@/lib/data";

export const metadata: Metadata = { title: "Price Book · Tidemark" };

interface PriceItem {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  component_type_key: string | null;
  unit: string;
  price_cents: number;
  taxable: boolean;
  warranty_months: number | null;
  sort_order: number;
  active: boolean;
}

function ItemFields({ item, types }: { item?: PriceItem; types: ComponentType[] }) {
  const p = item?.id ?? "new";
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SField
        label="Name"
        name="name"
        id={`name-${p}`}
        defaultValue={item?.name}
        className="lg:col-span-2"
      />
      <SField
        label="Price ($)"
        name="price"
        id={`price-${p}`}
        inputMode="decimal"
        defaultValue={item ? (item.price_cents / 100).toFixed(2) : ""}
      />
      <SField label="Unit" name="unit" id={`unit-${p}`} defaultValue={item?.unit ?? "each"} />
      <SField
        label="Category"
        name="category"
        id={`category-${p}`}
        defaultValue={item?.category ?? ""}
      />
      <Select
        label="Suggest for"
        name="component_type_key"
        id={`component-${p}`}
        defaultValue={item?.component_type_key ?? ""}
        options={[
          { value: "", label: "Any finding" },
          ...types.map((t) => ({ value: t.key, label: t.name })),
        ]}
      />
      <SField
        label="Warranty (months)"
        name="warranty_months"
        id={`warranty-${p}`}
        inputMode="numeric"
        defaultValue={item?.warranty_months ?? ""}
      />
      <SField
        label="Order"
        name="sort_order"
        id={`order-${p}`}
        inputMode="numeric"
        defaultValue={item?.sort_order ?? 0}
      />
      <SField
        label="Description"
        name="description"
        id={`description-${p}`}
        defaultValue={item?.description ?? ""}
        className="sm:col-span-2 lg:col-span-4"
        hint="Shown on quotes."
      />
      <div className="flex flex-wrap gap-6 sm:col-span-2 lg:col-span-4">
        <Checkbox label="Taxable" name="taxable" defaultChecked={item ? item.taxable : true} />
        {item ? (
          <Checkbox label="Available on quotes" name="active" defaultChecked={item.active} />
        ) : null}
      </div>
    </div>
  );
}

export default async function PriceBookPage() {
  const office = await getOffice();
  const [items, types] = await Promise.all([
    listConfig<PriceItem>(office, "price_book_item"),
    listConfig<ComponentType>(office, "component_type"),
  ]);

  return (
    <>
      <PageHeader
        title="Price Book"
        subtitle="Repair items techs pick from when building a quote. Prices are suggestions; a tech can adjust within the discount limit."
      />
      <div className="space-y-6">
        <Card>
          <h2 className="mb-4 font-display text-xl font-bold">Add an item</h2>
          <SettingsForm action={savePriceItem} submit="Add Item" primary>
            <ItemFields types={types} />
          </SettingsForm>
        </Card>

        {items.length === 0 ? <Empty>No items yet.</Empty> : null}
        {items.map((item) => (
          <details
            key={item.id}
            className="group rounded-lg border border-border bg-surface"
            data-testid="price-item"
          >
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3">
              <span>
                <span className="font-semibold">{item.name}</span>
                {item.category ? <span className="text-text-muted"> · {item.category}</span> : null}
                {!item.active ? <span className="text-text-muted"> · hidden</span> : null}
              </span>
              <span className="flex items-center gap-3">
                <span className="font-semibold tabular-nums">
                  {formatCents(item.price_cents)}{" "}
                  <span className="font-normal text-text-muted">/ {item.unit}</span>
                </span>
                <span aria-hidden="true" className="text-text-muted group-open:rotate-90">
                  ›
                </span>
              </span>
            </summary>
            <div className="border-t border-border px-5 py-4">
              <SettingsForm action={savePriceItem} submit="Save Item">
                <input type="hidden" name="id" value={item.id} />
                <ItemFields item={item} types={types} />
              </SettingsForm>
              <div className="mt-4">
                <SettingsForm
                  action={removeConfigRow}
                  submit="Remove Item"
                  danger
                  confirm="Remove this item from the price book?"
                >
                  <input type="hidden" name="table" value="price_book_item" />
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="path" value="/settings/price-book" />
                </SettingsForm>
              </div>
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
