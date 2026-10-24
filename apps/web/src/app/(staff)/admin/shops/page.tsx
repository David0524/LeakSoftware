import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  formatCents,
  heardFromCounts,
  heardFromText,
  searchShops,
  servicesLabel,
  shopPriceCents,
  shopStanding,
  sortShops,
  STANDING_LABELS,
  type ShopSort,
  type Standing,
} from "@leakbook/core";
import {
  fmtDate,
  relDays,
  SearchForm,
  SortHeader,
  StandingPill,
  TABLE,
  TwoStepNeeded,
} from "@/components/admin/kit";
import { Empty, PageHeader, pillClass } from "@/components/ui";
import { loadShops, staffGate } from "@/server/staff";

export const metadata: Metadata = { title: "Shops" };

const FILTERS: (Standing | "all")[] = [
  "all",
  "trial",
  "paying",
  "past_due",
  "trial_ended",
  "demo",
  "canceled",
];
const SORTS: ShopSort[] = ["name", "standing", "people", "price", "created", "active", "jobs"];

/** Every shop: search, filter by standing, sort by any column, export (owner, 2026-10-22). */
export default function ShopsPage({ searchParams }: PageProps<"/admin/shops">) {
  return (
    <Suspense fallback={<div className="h-96" aria-label="Loading" />}>
      <Shops searchParams={searchParams} />
    </Suspense>
  );
}

async function Shops({
  searchParams,
}: {
  searchParams: PageProps<"/admin/shops">["searchParams"];
}) {
  const gate = await staffGate("/admin/shops");
  if ("needsTwoStep" in gate) return <TwoStepNeeded title="Shops" />;
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = one(params.q);
  const show = FILTERS.includes(one(params.show) as Standing)
    ? (one(params.show) as Standing)
    : "all";
  const sort = SORTS.includes(one(params.sort) as ShopSort)
    ? (one(params.sort) as ShopSort)
    : "created";
  const desc = one(params.dir) ? one(params.dir) === "desc" : sort !== "name";

  const all = await loadShops();
  const found = searchShops(all, q);
  const counts = new Map<string, number>([["all", found.length]]);
  for (const s of found) {
    const st = shopStanding(s);
    counts.set(st, (counts.get(st) ?? 0) + 1);
  }
  const sources = heardFromCounts(found);
  const rows = sortShops(
    show === "all" ? found : found.filter((s) => shopStanding(s) === show),
    sort,
    desc,
  );
  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams({
      ...(q ? { q } : {}),
      ...(show !== "all" ? { show } : {}),
      sort,
      dir: desc ? "desc" : "asc",
      ...over,
    });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return `/admin/shops?${p}`;
  };
  const sortHref = (column: string, d: boolean) => href({ sort: column, dir: d ? "desc" : "asc" });

  return (
    <>
      <PageHeader
        title="Shops"
        subtitle="Every shop on Sundeck Pro. Prices are each package's for its active people."
        actions={
          <a
            href={`/admin/shops/export${q || show !== "all" ? `?${new URLSearchParams({ q, show })}` : ""}`}
            className="min-h-11 content-center px-3 text-link"
          >
            Export CSV
          </a>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <SearchForm
          action="/admin/shops"
          value={q}
          placeholder="Search shops, owners, emails, phones"
          hidden={show !== "all" ? { show } : {}}
        />
      </div>
      <nav aria-label="Show" className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={href({ show: f === "all" ? "" : f })}
            aria-current={f === show ? "page" : undefined}
            className={pillClass(f === show)}
          >
            {f === "all" ? "All" : STANDING_LABELS[f]} ({counts.get(f) ?? 0})
          </Link>
        ))}
      </nav>
      {sources.length ? (
        // Where shops heard of Sundeck Pro (owner, 2026-10-24), for the shops searched for.
        <section aria-labelledby="heard-from" className="card mb-5 p-4" data-testid="heard-from">
          <h2 id="heard-from" className="font-semibold">
            How Shops Heard About Us
          </h2>
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
            {sources.map((c) => (
              <li key={c.key ?? "none"} className={c.key ? undefined : "text-text-muted"}>
                {c.label} <span className="font-semibold tabular-nums">{c.count}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {rows.length === 0 ? (
        <Empty>{q ? `No shops match “${q}”.` : "No shops here."}</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className={TABLE}>
            <thead className="border-b border-border">
              <tr>
                <SortHeader label="Shop" column="name" {...{ sort, desc }} href={sortHref} />
                <SortHeader
                  label="Standing"
                  column="standing"
                  {...{ sort, desc }}
                  href={sortHref}
                />
                <th scope="col" className="px-3 py-2 font-semibold text-text-muted">
                  Package
                </th>
                <SortHeader
                  label="People"
                  column="people"
                  {...{ sort, desc }}
                  href={sortHref}
                  align="right"
                />
                <SortHeader
                  label="Price"
                  column="price"
                  {...{ sort, desc }}
                  href={sortHref}
                  align="right"
                />
                <SortHeader
                  label="Signed Up"
                  column="created"
                  {...{ sort, desc }}
                  href={sortHref}
                />
                <SortHeader
                  label="Last Active"
                  column="active"
                  {...{ sort, desc }}
                  href={sortHref}
                />
                <SortHeader
                  label="Jobs (30 Days)"
                  column="jobs"
                  {...{ sort, desc }}
                  href={sortHref}
                  align="right"
                />
                <th scope="col" className="px-3 py-2 font-semibold text-text-muted">
                  Heard From
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} data-testid="shop-row">
                  <td>
                    <Link
                      href={`/admin/shops/${s.id}`}
                      className="font-semibold text-link hover:underline"
                    >
                      {s.name}
                    </Link>
                    <span className="block text-[0.8125rem] text-text-muted">
                      {[s.owner_name, s.owner_email].filter(Boolean).join(" · ") || "No owner"}
                    </span>
                  </td>
                  <td>
                    <StandingPill standing={shopStanding(s)} />
                    {shopStanding(s) === "trial" && s.trial_ends_at ? (
                      <span className="block text-[0.8125rem] text-text-muted">
                        Ends {fmtDate(s.trial_ends_at)}
                      </span>
                    ) : null}
                  </td>
                  <td>{servicesLabel(s.services)}</td>
                  <td className="text-right tabular-nums">{s.people}</td>
                  <td className="text-right tabular-nums">{formatCents(shopPriceCents(s))}</td>
                  <td className="whitespace-nowrap">{fmtDate(s.created_at)}</td>
                  <td className="whitespace-nowrap">{relDays(s.last_active_at)}</td>
                  <td className="text-right tabular-nums">{s.jobs_30d}</td>
                  <td
                    className="max-w-48 truncate"
                    title={heardFromText(s.heard_from, s.heard_from_other) ?? undefined}
                  >
                    {heardFromText(s.heard_from, s.heard_from_other) ?? (
                      <span className="text-text-muted">No answer</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
