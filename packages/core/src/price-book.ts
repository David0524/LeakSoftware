// Settings › Price Book: how items group into categories, and the category picker of an item's
// form (owner, 2026-10-25). The iPhone app ports these in Model/ShopSettingsData.swift.

/** The category whose items techs add on visits as chemicals. */
export const CHEMICALS_CATEGORY = "Chemicals";

/** The picker's write-in choice, and the category saved when its field is left blank. */
export const OTHER_CATEGORY = "Other";

export const PRICE_BOOK_TEXT = {
  category: "Category",
  newCategory: "New category",
  newCategoryPlaceholder: "Other",
  /** The heading of items saved without a category, before categories were picked. */
  uncategorized: "Other items",
} as const;

export interface PriceBookSection<T> {
  /** The trimmed category, "" for items without one. */
  category: string;
  items: T[];
}

/**
 * Items grouped by category in the order the categories first appear, with Chemicals first
 * (owner, 2026-10-25: "move chemicals to the top") and items without a category last.
 */
export function priceBookSections<T extends { category?: string | null }>(
  items: T[],
): PriceBookSection<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.category?.trim() ?? "";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const rank = (key: string) => (key === CHEMICALS_CATEGORY ? 0 : key === "" ? 2 : 1);
  return [...groups.entries()]
    .map(([category, rows]) => ({ category, items: rows }))
    .sort((a, b) => rank(a.category) - rank(b.category));
}

/**
 * The choices of an item's category picker: the shop's categories in price book order (and
 * Chemicals for pool shops), then Other, which opens a field to write one in.
 */
export function priceBookCategoryChoices(
  items: { category?: string | null }[],
  pool: boolean,
): string[] {
  const names = priceBookSections(items)
    .map((s) => s.category)
    .filter((c) => c !== "" && c !== OTHER_CATEGORY);
  if (pool && !names.includes(CHEMICALS_CATEGORY)) names.unshift(CHEMICALS_CATEGORY);
  return [...names, OTHER_CATEGORY];
}

/**
 * What the picker starts on for an item: its own category when it's one of the choices,
 * otherwise Other with its category written in ("" for a new item, so it saves as Other).
 */
export function priceBookCategoryStart(
  category: string | null | undefined,
  choices: string[],
): { choice: string; custom: string } {
  const current = category?.trim() ?? "";
  if (current && current !== OTHER_CATEGORY && choices.includes(current)) {
    return { choice: current, custom: "" };
  }
  return { choice: OTHER_CATEGORY, custom: current === OTHER_CATEGORY ? "" : current };
}

/** The category saved: the chosen one, or what was written under Other, or "Other" if blank. */
export function priceBookCategory(choice: string, custom: string): string {
  if (choice && choice !== OTHER_CATEGORY) return choice.trim();
  return custom.trim() || OTHER_CATEGORY;
}
