import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { fmtDate, relDays, SearchForm, TABLE, TwoStepNeeded } from "@/components/admin/kit";
import { Empty, PageHeader, pillClass } from "@/components/ui";
import { loadPeople, staffGate } from "@/server/staff";

export const metadata: Metadata = { title: "People" };

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", tech: "Tech" };

/** Every account across shops (owner, 2026-10-22: "customer data"). Newest first, 300 at most. */
export default function PeoplePage({ searchParams }: PageProps<"/k4cs4uxrntb27z/people">) {
  return (
    <Suspense fallback={<div className="h-96" aria-label="Loading" />}>
      <People searchParams={searchParams} />
    </Suspense>
  );
}

async function People({
  searchParams,
}: {
  searchParams: PageProps<"/k4cs4uxrntb27z/people">["searchParams"];
}) {
  const gate = await staffGate("/k4cs4uxrntb27z/people");
  if ("needsTwoStep" in gate) return <TwoStepNeeded title="People" />;
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = one(params.q);
  // Sundeck Pro's own accounts (staff logins, the demo and App Review shops' people) are left
  // out of Everyone and every count (owner, 2026-11-16).
  const internal = one(params.show) === "internal";
  const [counted, ours] = await Promise.all([loadPeople(q), loadPeople(q, true)]);
  const people = internal ? ours : counted;
  const href = (show: string) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...(show ? { show } : {}) });
    return `/k4cs4uxrntb27z/people${p.size ? `?${p}` : ""}`;
  };
  return (
    <>
      <PageHeader
        title="People"
        subtitle="Everyone with a Sundeck Pro account, newest first. Search finds older ones."
      />
      <div className="mb-5">
        <SearchForm
          action="/k4cs4uxrntb27z/people"
          value={q}
          placeholder="Search names, emails, phones"
          hidden={internal ? { show: "internal" } : {}}
        />
      </div>
      <nav aria-label="Show" className="mb-5 flex flex-wrap gap-2">
        <Link
          href={href("")}
          aria-current={internal ? undefined : "page"}
          className={pillClass(!internal)}
        >
          Everyone ({counted.length})
        </Link>
        <Link
          href={href("internal")}
          aria-current={internal ? "page" : undefined}
          className={pillClass(internal)}
        >
          Internal ({ours.length})
        </Link>
      </nav>
      {internal ? (
        <p className="mb-4 text-[0.9375rem] text-text-muted">
          Our own accounts: staff logins and the people in internal shops. They can sign in as
          usual, but aren’t counted anywhere in the portal.
        </p>
      ) : null}
      {people.length === 0 ? (
        <Empty>
          {q ? `No one matches “${q}”.` : internal ? "No internal accounts." : "No accounts yet."}
        </Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className={TABLE}>
            <thead className="border-b border-border text-text-muted">
              <tr>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Person
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Shops
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Signed Up
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Last Sign-In
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Apps
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Two-Step
                </th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} data-testid="person-row">
                  <td>
                    <Link
                      href={`/k4cs4uxrntb27z/people/${p.id}`}
                      className="font-semibold text-link hover:underline"
                    >
                      {p.name ?? p.email}
                    </Link>
                    <span className="block text-[0.8125rem] text-text-muted">{p.email}</span>
                  </td>
                  <td>
                    {p.shops.length === 0 ? (
                      <span className="text-text-muted">No shop</span>
                    ) : (
                      p.shops.map((s) => (
                        <span key={s.company_id} className="block">
                          <Link
                            href={`/k4cs4uxrntb27z/shops/${s.company_id}`}
                            className="text-link hover:underline"
                          >
                            {s.company_name}
                          </Link>{" "}
                          <span className="text-text-muted">
                            {ROLE[s.role] ?? s.role}
                            {s.status === "disabled" ? ", off" : ""}
                          </span>
                        </span>
                      ))
                    )}
                  </td>
                  <td className="whitespace-nowrap">{fmtDate(p.created_at)}</td>
                  <td className="whitespace-nowrap">{relDays(p.last_sign_in_at)}</td>
                  <td>{p.apps.length ? p.apps.join(", ") : "Website"}</td>
                  <td>{p.two_step ? "On" : "Off"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
