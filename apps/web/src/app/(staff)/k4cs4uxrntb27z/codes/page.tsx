import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { offerText, referralRewardText } from "@leakbook/core";
import { NewPromoCode, PromoCodeToggle } from "@/components/admin/codes";
import { fmtDate, Panel, Pill, TABLE, TwoStepNeeded } from "@/components/admin/kit";
import { Empty, PageHeader } from "@/components/ui";
import { loadCodes, staffGate, type CodeShop } from "@/server/staff";

export const metadata: Metadata = { title: "Codes" };

/**
 * Codes (owner, 2026-11-23: "we should be able to see what promo code they use"): promo codes
 * with the shops that used each, New Code and Turn Off; referrals (who referred whom, and the
 * referring shop's free month); demo codes, read-only.
 */
export default function CodesPage() {
  return (
    <Suspense fallback={<div className="h-96" aria-label="Loading" />}>
      <Codes />
    </Suspense>
  );
}

function ShopLink({ shop }: { shop: Pick<CodeShop, "id" | "name"> }) {
  return (
    <Link href={`/k4cs4uxrntb27z/shops/${shop.id}`} className="text-link hover:underline">
      {shop.name}
    </Link>
  );
}

const TH = "px-3 py-2 font-semibold whitespace-nowrap";

async function Codes() {
  const gate = await staffGate("/k4cs4uxrntb27z/codes");
  if ("needsTwoStep" in gate) return <TwoStepNeeded title="Codes" />;
  const codes = await loadCodes();
  return (
    <>
      <PageHeader
        title="Codes"
        subtitle="Promo codes we make, shops’ referral codes (their names), and demo codes. Shops enter them on the trial page or in Sundeck Pro Billing, one per shop."
        actions={<NewPromoCode />}
      />
      <div className="space-y-6">
        <Panel title="Promo Codes" subtitle="Turning a code off stops new shops using it.">
          {codes.promo.length === 0 ? (
            <Empty>No promo codes yet.</Empty>
          ) : (
            <table className={TABLE}>
              <thead className="border-b border-border text-text-muted">
                <tr>
                  <th scope="col" className={TH}>
                    Code
                  </th>
                  <th scope="col" className={TH}>
                    Offer
                  </th>
                  <th scope="col" className={TH}>
                    Used By
                  </th>
                  <th scope="col" className={TH}>
                    Last Day
                  </th>
                  <th scope="col" className={TH}>
                    Status
                  </th>
                  <th scope="col" className={TH}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {codes.promo.map((p) => (
                  <tr key={p.code} data-testid="promo-row">
                    <td>
                      <span className="font-mono font-semibold">{p.code}</span>
                      {p.note ? (
                        <span className="block text-[0.8125rem] text-text-muted">{p.note}</span>
                      ) : null}
                      <span className="block text-[0.8125rem] text-text-muted">
                        Made {fmtDate(p.created_at)}
                        {p.created_by ? ` by ${p.created_by}` : ""}
                      </span>
                    </td>
                    <td>
                      {offerText({
                        freeMonths: p.free_months,
                        percentOff: p.percent_off,
                        percentMonths: p.percent_months,
                      })}
                    </td>
                    <td>
                      {p.shops.length === 0 ? (
                        <span className="text-text-muted">
                          No shops yet{p.max_uses ? ` (up to ${p.max_uses})` : ""}
                        </span>
                      ) : (
                        <details>
                          <summary className="min-h-11 cursor-pointer content-center text-link">
                            {p.shops.length} {p.shops.length === 1 ? "shop" : "shops"}
                            {p.max_uses ? ` of ${p.max_uses}` : ""}
                          </summary>
                          <ul className="mt-1 space-y-1">
                            {p.shops.map((s) => (
                              <li key={s.id}>
                                <ShopLink shop={s} /> · {fmtDate(s.applied_at)}
                                {s.subscribed ? " · card in" : ""}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {p.expires_at ? fmtDate(p.expires_at) : "None"}
                    </td>
                    <td>
                      {p.active ? (
                        <Pill className="bg-status-pass/12 text-status-pass">On</Pill>
                      ) : (
                        <Pill className="bg-text/[0.07] text-text-muted">Off</Pill>
                      )}
                    </td>
                    <td>
                      <PromoCodeToggle code={p.code} active={p.active} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel
          title="Referrals"
          subtitle="A shop that enters another shop’s name gets an extra month free. The other shop gets a free month after the new shop’s first payment."
        >
          {codes.referrals.length === 0 ? (
            <Empty>No referrals yet.</Empty>
          ) : (
            <table className={TABLE}>
              <thead className="border-b border-border text-text-muted">
                <tr>
                  <th scope="col" className={TH}>
                    New Shop
                  </th>
                  <th scope="col" className={TH}>
                    Referred By
                  </th>
                  <th scope="col" className={TH}>
                    Used
                  </th>
                  <th scope="col" className={TH}>
                    Referring Shop’s Month
                  </th>
                </tr>
              </thead>
              <tbody>
                {codes.referrals.map((r) => (
                  <tr key={r.id} data-testid="referral-row">
                    <td>
                      <ShopLink shop={r} />
                    </td>
                    <td>
                      {r.referrer_id && r.referrer_name ? (
                        <ShopLink shop={{ id: r.referrer_id, name: r.referrer_name }} />
                      ) : (
                        <span className="text-text-muted">A closed shop</span>
                      )}
                      <span className="block font-mono text-[0.8125rem] text-text-muted">
                        {r.code}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">{fmtDate(r.applied_at)}</td>
                    <td>
                      {referralRewardText(r.reward, r.reward_cents)}
                      {r.rewarded_at ? (
                        <span className="block text-[0.8125rem] text-text-muted">
                          {fmtDate(r.rewarded_at)}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Demo Codes" subtitle="A demo code makes a shop free: no card, no charge.">
          {codes.demo.length === 0 ? (
            <Empty>No demo codes.</Empty>
          ) : (
            <table className={TABLE}>
              <thead className="border-b border-border text-text-muted">
                <tr>
                  <th scope="col" className={TH}>
                    Code
                  </th>
                  <th scope="col" className={TH}>
                    Used By
                  </th>
                  <th scope="col" className={TH}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {codes.demo.map((d) => (
                  <tr key={d.code}>
                    <td>
                      <span className="font-mono font-semibold">{d.code}</span>
                      {d.note ? (
                        <span className="block text-[0.8125rem] text-text-muted">{d.note}</span>
                      ) : null}
                    </td>
                    <td>
                      {d.uses} {d.uses === 1 ? "shop" : "shops"}
                      {d.max_uses ? ` of ${d.max_uses}` : ""}
                    </td>
                    <td>{d.active ? "On" : "Off"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}
