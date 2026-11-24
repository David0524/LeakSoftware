import type { Metadata } from "next";
import { Suspense } from "react";
import { formatCents, priceListFromJson, type PriceList } from "@leakbook/core";
import { PriceListForm } from "@/components/admin/billing";
import { fmtDate, Panel, TABLE, TwoStepNeeded } from "@/components/admin/kit";
import { PageHeader } from "@/components/ui";
import { loadPriceLists, staffGate } from "@/server/staff";

export const metadata: Metadata = { title: "Pricing" };

/**
 * Pricing (owner, 2026-11-24: "full control over pricing"): the prices new shops pay, edited
 * here instead of in code. Each save is a new list; shops already subscribed keep the list they
 * subscribed under. The home page, sign-up and the trial page show the newest.
 */
export default function PricingPage() {
  return (
    <Suspense fallback={<div className="h-96" aria-label="Loading" />}>
      <Pricing />
    </Suspense>
  );
}

const tiers = (p: PriceList) =>
  [p.maintenance, p.leak]
    .map((plan) => `${plan.name}: ${plan.tiers.map((t) => formatCents(t.priceCents)).join(", ")}`)
    .join(" · ") + ` · Both +${formatCents(p.bothAddonCents)}`;

async function Pricing() {
  const gate = await staffGate("/k4cs4uxrntb27z/pricing");
  if ("needsTwoStep" in gate) return <TwoStepNeeded title="Pricing" />;
  const lists = await loadPriceLists();
  const current = priceListFromJson(lists[0]?.prices);
  return (
    <>
      <PageHeader
        title="Pricing"
        subtitle="What new shops pay. Saving makes a new price list; shops already subscribed keep theirs, and a shop’s own price is set on its page."
      />
      <div className="space-y-6">
        <PriceListForm prices={current} />
        <Panel
          title="Price Lists"
          subtitle="Newest first. Shops count those Stripe bills under each."
        >
          <table className={TABLE}>
            <thead className="border-b border-border text-text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">
                  Saved
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Prices
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Why
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Shops
                </th>
              </tr>
            </thead>
            <tbody>
              {lists.map((l, i) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {fmtDate(l.created_at)}
                    {i === 0 ? " · Current" : ""}
                  </td>
                  <td className="px-3 py-2">{tiers(priceListFromJson(l.prices))}</td>
                  <td className="px-3 py-2">
                    {l.note ?? "—"}
                    {l.created_by && l.created_by !== "system" ? ` · ${l.created_by}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.shops}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
