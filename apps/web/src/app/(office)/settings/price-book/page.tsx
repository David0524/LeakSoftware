import type { Metadata } from "next";
import {
  CHARGE_CHEMICALS_TEXT,
  CHEMICALS_CATEGORY,
  PRICE_BOOK_TEXT,
  chargesChemicals,
  offersPool,
  priceBookCategoryChoices,
  priceBookSections,
} from "@leakbook/core";
import { formatCents, isCustomItemType } from "@leakbook/core";
import { removeConfigRow, savePriceItem } from "@/app/actions/settings";
import {
  SField,
  SSelect,
  SSwitch,
  SettingsFields,
  SettingsForm,
} from "@/components/settings-forms";
import { SettingsListPage, SheetDanger, SheetRow } from "@/components/settings-list";
import { ChargeChemicalsSwitch } from "@/components/charge-chemicals";
import { PriceBookChemicals, PriceCategoryField } from "@/components/price-book";
import { Empty, Grouped } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { listConfig, type ComponentType, getCompany } from "@/lib/data";

export const metadata: Metadata = { title: "Price Book · Sundeck Pro" };

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
  on_repair_call?: boolean;
}

function ItemFields({
  item,
  types,
  categories,
}: {
  item?: PriceItem;
  types: ComponentType[];
  categories: string[];
}) {
  const p = item?.id ?? "new";
  return (
    <>
      <SettingsFields labelWidth="7.5rem" className="sm:grid sm:grid-cols-2 sm:gap-4">
        <SField
          label="Name"
          name="name"
          id={`name-${p}`}
          defaultValue={item?.name}
          className="sm:col-span-2"
          required
        />
        <SField
          label="Price ($)"
          name="price"
          id={`price-${p}`}
          inputMode="decimal"
          defaultValue={item ? (item.price_cents / 100).toFixed(2) : ""}
          required
        />
        <SField label="Unit" name="unit" id={`unit-${p}`} defaultValue={item?.unit ?? "each"} />
        <PriceCategoryField idPrefix={p} category={item?.category} choices={categories} />
        <SSelect
          label="Suggest for"
          name="component_type_key"
          id={`component-${p}`}
          defaultValue={item?.component_type_key ?? ""}
          options={[
            { value: "", label: "Any finding" },
            ...types
              .filter((t) => !isCustomItemType(t))
              .map((t) => ({ value: t.key, label: t.name })),
          ]}
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
          className="sm:col-span-2"
          hint="Shown on quotes."
        />
      </SettingsFields>
      <SettingsFields>
        <SSwitch
          label="Taxable"
          name="taxable"
          id={`taxable-${p}`}
          defaultChecked={item ? item.taxable : true}
        />
        <SSwitch
          label="Show when booking a repair"
          name="on_repair_call"
          id={`repair-call-${p}`}
          defaultChecked={item?.on_repair_call ?? false}
        />
        {item ? (
          <SSwitch
            label="Available on quotes"
            name="active"
            id={`active-${p}`}
            defaultChecked={item.active}
          />
        ) : null}
      </SettingsFields>
    </>
  );
}

export default async function PriceBookPage() {
  const office = await getOffice();
  const [items, types, company] = await Promise.all([
    listConfig<PriceItem>(office, "price_book_item"),
    listConfig<ComponentType>(office, "component_type"),
    getCompany(office),
  ]);
  // Grouped by category, Chemicals first and uncategorized items last (owner, 2026-10-25).
  const pool = offersPool(company.settings);
  const sections = priceBookSections(items);
  const categories = priceBookCategoryChoices(items, pool);
  const charges = chargesChemicals(company.settings);
  const titled = sections.length > 1 || (sections[0] && sections[0].category !== "");
  const rowsOf = (rows: PriceItem[]) =>
    rows.map((item) => (
      <SheetRow
        key={item.id}
        testId="price-item"
        remove={{
          table: "price_book_item",
          id: item.id,
          path: "/settings/price-book",
          confirm: "Remove this item from the price book?",
          confirmLabel: "Remove Item",
        }}
        title={item.name}
        label={item.name}
        detail={
          [item.active ? null : "Hidden", item.on_repair_call ? "On the repair menu" : null]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        value={
          <span className="inline-block max-w-48 tabular-nums [overflow-wrap:anywhere]">
            <span className="text-text">{formatCents(item.price_cents)}</span> / {item.unit}
          </span>
        }
      >
        <SettingsForm action={savePriceItem} submit="Save Item" primary full>
          <input type="hidden" name="id" value={item.id} />
          <ItemFields item={item} types={types} categories={categories} />
        </SettingsForm>
        <SheetDanger>
          <SettingsForm
            action={removeConfigRow}
            submit="Remove Item"
            danger
            full
            confirm="Remove this item from the price book?"
          >
            <input type="hidden" name="table" value="price_book_item" />
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="path" value="/settings/price-book" />
          </SettingsForm>
        </SheetDanger>
      </SheetRow>
    ));

  return (
    <SettingsListPage
      title="Price Book"
      add={{
        label: "Add Item",
        form: (
          <SettingsForm action={savePriceItem} submit="Add Item" primary full>
            <ItemFields types={types} categories={categories} />
          </SettingsForm>
        ),
      }}
    >
      {items.length === 0 ? <Empty>No items yet.</Empty> : null}
      {/* Chemicals that techs add on visits go on the monthly invoice when the shop charges for
          them (owner, 2026-10-24); the switch sits with the prices it uses. Only owners and
          admins reach this page. */}
      {pool && !sections.some((s) => s.category === CHEMICALS_CATEGORY) ? (
        <Grouped
          title="Chemicals"
          footer={charges ? CHARGE_CHEMICALS_TEXT.on : CHARGE_CHEMICALS_TEXT.off}
        >
          <li>
            <ChargeChemicalsSwitch initial={charges} />
          </li>
        </Grouped>
      ) : null}
      {sections.map(({ category, items: rows }) =>
        category === CHEMICALS_CATEGORY ? (
          <PriceBookChemicals
            key={category}
            charges={charges}
            showSwitch={pool}
            count={rows.length}
          >
            {rowsOf(rows)}
          </PriceBookChemicals>
        ) : (
          <Grouped
            key={category}
            title={titled ? category || PRICE_BOOK_TEXT.uncategorized : undefined}
          >
            {rowsOf(rows)}
          </Grouped>
        ),
      )}
    </SettingsListPage>
  );
}
