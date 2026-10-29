"use client";

import { SortMenu } from "./sort-menu";
import { Button } from "./ui";

/**
 * Customers: search, then Show and Sort as the same two compact menus Jobs uses (owner,
 * 2026-10-18: "sort customers by a variety of filters"; 2026-10-29: "Customers filters like
 * Jobs"). The choices live in the address; picking one applies it at once.
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
  const href = (next: { sort?: string; show?: string }) => {
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    const s = next.sort ?? sort;
    const f = next.show ?? show;
    if (s !== "name") p.set("sort", s);
    if (f !== "all") p.set("show", f);
    const qs = p.toString();
    return qs ? `/customers?${qs}` : "/customers";
  };
  return (
    <div className="mb-5 flex max-w-4xl flex-wrap items-center gap-3">
      {/* At least 18rem, so on a phone the menus wrap under it instead of squeezing it. */}
      <form role="search" action="/customers" className="flex min-w-0 flex-1 basis-72 gap-2">
        {sort !== "name" ? <input type="hidden" name="sort" value={sort} /> : null}
        {show !== "all" ? <input type="hidden" name="show" value={show} /> : null}
        <label htmlFor="q" className="sr-only">
          Search customers
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={search}
          placeholder="Name, phone, or email"
          className="min-h-11 min-w-0 flex-1 truncate rounded-[10px] border border-control-border bg-surface px-3 focus:outline-3 focus:outline-focus"
        />
        <Button type="submit" kind="secondary">
          Search
        </Button>
      </form>
      {/* Sort takes only what its words need, so Show's count fits beside it on a phone. */}
      <div className="flex min-w-0 gap-3 max-sm:w-full">
        <div className="flex min-w-0 flex-1">
          <SortMenu
            compact
            label="Show"
            name="show"
            options={shows.map((o) => ({ key: o.value, label: o.label }))}
            value={show}
            hrefFor={Object.fromEntries(shows.map((o) => [o.value, href({ show: o.value })]))}
          />
        </div>
        <div className="flex shrink-0">
          <SortMenu
            compact
            options={sorts.map((o) => ({ key: o.value, label: o.label }))}
            value={sort}
            hrefFor={Object.fromEntries(sorts.map((o) => [o.value, href({ sort: o.value })]))}
          />
        </div>
      </div>
    </div>
  );
}
