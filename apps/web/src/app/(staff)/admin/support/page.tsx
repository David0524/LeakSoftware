import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { fmtTime, Panel, SupportTable, TwoStepNeeded } from "@/components/admin/kit";
import { Button, PageHeader } from "@/components/ui";
import { loadSupportSessions, staffGate } from "@/server/staff";

export const metadata: Metadata = { title: "Support" };

/**
 * Support sessions (owner, 2026-10-22: "Admin access to customer accounts for tech help"):
 * open now, and every one before. Open a shop from its page in Shops.
 */
export default function SupportPage() {
  return (
    <Suspense fallback={<div className="h-96" aria-label="Loading" />}>
      <Support />
    </Suspense>
  );
}

async function Support() {
  const gate = await staffGate("/admin/support");
  if ("needsTwoStep" in gate) return <TwoStepNeeded title="Support" />;
  const sessions = await loadSupportSessions();
  const now = new Date().getTime();
  const open = sessions.filter((s) => !s.ended_at && Date.parse(s.ends_at) > now);
  const mine = open.find((s) => s.staff_email === gate.staff.email);
  return (
    <>
      <PageHeader
        title="Support"
        subtitle={
          <>
            Help a shop in its own office. Find it in{" "}
            <Link href="/admin/shops" className="text-link underline">
              Shops
            </Link>{" "}
            and choose Open Shop: View Only, or Can Make Changes, for up to 2 hours. Staff see what
            the shop’s admins see, never owner-only pages, and don’t appear in the shop.
          </>
        }
      />
      {mine ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-navy px-5 py-4 text-white">
          <p>
            You have <span className="font-semibold">{mine.company_name}</span> open (
            {mine.access === "view" ? "View Only" : "Can Make Changes"}) until{" "}
            {fmtTime(mine.ends_at)}.
          </p>
          <div className="flex gap-2">
            <Link
              href="/home"
              className="inline-flex min-h-11 items-center rounded-full bg-white px-5 font-semibold text-navy"
            >
              Go to Shop
            </Link>
            <form method="post" action="/api/admin/support/end">
              <input type="hidden" name="company_id" value={mine.company_ref} />
              <Button type="submit" kind="onDark">
                End Session
              </Button>
            </form>
          </div>
        </div>
      ) : null}
      <div className="space-y-6">
        <Panel title="Open Now" subtitle="Sessions that haven't ended or run out.">
          {open.length === 0 ? (
            <p className="text-text-muted">No one has a shop open.</p>
          ) : (
            <SupportTable rows={open} showShop />
          )}
        </Panel>
        <Panel title="History" subtitle="The last 200 sessions.">
          {sessions.length === 0 ? (
            <p className="text-text-muted">No sessions yet.</p>
          ) : (
            <SupportTable rows={sessions} showShop />
          )}
        </Panel>
      </div>
    </>
  );
}
