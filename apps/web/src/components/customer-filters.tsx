"use client";

import { Button, Select } from "./ui";

/**
 * Customers: search, then Sort and Show (owner, 2026-10-18: "sort customers by a variety of
 * filters"). One plain GET form, so the choices live in the address; picking a sort or a
 * filter applies it at once.
 */
export function CustomerFilters({
  search,
  sort,
  show,
  sorts,
  shows,
}: {
  search: string;
  sort: string;
  show: string;
  sorts: { value: string; label: string }[];
  shows: { value: string; label: string }[];
}) {
  const apply = (e: React.ChangeEvent<HTMLSelectElement>) => e.currentTarget.form?.requestSubmit();
  return (
    <form role="search" action="/customers" className="mb-5 max-w-3xl space-y-3">
      <div className="flex gap-2">
        <label htmlFor="q" className="sr-only">
          Search customers
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={search}
          placeholder="Name, phone, or email"
          className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-control-border bg-surface px-3 focus:outline-3 focus:outline-focus"
        />
        <Button type="submit" kind="secondary">
          Search
        </Button>
      </div>
      {/* Phones stack Sort and Show, so Show's count is never cut off ("On a Plan (65)"). */}
      <div className="grid gap-3 sm:max-w-xl sm:grid-cols-2">
        <Select label="Sort" name="sort" defaultValue={sort} options={sorts} onChange={apply} />
        <Select label="Show" name="show" defaultValue={show} options={shows} onChange={apply} />
      </div>
    </form>
  );
}
