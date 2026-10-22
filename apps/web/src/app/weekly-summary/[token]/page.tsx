import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { WeeklySummaryOffForm } from "@/components/weekly-summary-off-form";
import { publicClient } from "@/server/reports";
import { CardSkeleton } from "@/components/page-skeleton";

export const metadata: Metadata = { title: "Weekly Summary", robots: { index: false } };

/**
 * From the link at the bottom of the weekly summary email (owner, 2026-10-22): turns it off
 * for that person, without signing in. A button, not the link itself, so mail scanners that
 * open links don't turn it off.
 */
export default function WeeklySummaryPage({ params }: PageProps<"/weekly-summary/[token]">) {
  return (
    <main className="lb-light min-h-full flex-1 bg-bg text-text">
      <Suspense fallback={<CardSkeleton />}>
        <WeeklySummary params={params} />
      </Suspense>
    </main>
  );
}

async function WeeklySummary({
  params,
}: {
  params: PageProps<"/weekly-summary/[token]">["params"];
}) {
  const { token } = await params;
  const { data } = await publicClient().rpc("weekly_summary_link", { link_token: token });
  const link = data as { company_name: string; email: string; on: boolean } | null;
  if (!link) notFound();
  return (
    <article className="mx-auto max-w-lg p-4 sm:p-10">
      <div className="card space-y-4 p-5">
        <h1 className="font-display text-2xl font-extrabold">Turn off the weekly summary?</h1>
        <p>
          Each Monday, Sundeck Pro emails {link.email} last week’s jobs and money at{" "}
          {link.company_name}, and the quotes waiting. You can turn it back on in More ›
          Notifications.
        </p>
        <WeeklySummaryOffForm token={token} off={!link.on} />
      </div>
    </article>
  );
}
