import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StopForm } from "@/components/stop-form";
import { publicClient } from "@/server/reports";
import { CardSkeleton } from "@/components/page-skeleton";

export const metadata: Metadata = { title: "Email Preferences", robots: { index: false } };

/** From the link at the bottom of a reminder or review email: no sign-in. */
export default function StopPage({ params }: PageProps<"/stop/[token]">) {
  return (
    <main className="lb-light min-h-full flex-1 bg-bg text-text">
      <Suspense fallback={<CardSkeleton />}>
        <Stop params={params} />
      </Suspense>
    </main>
  );
}

async function Stop({ params }: { params: PageProps<"/stop/[token]">["params"] }) {
  const { token } = await params;
  const { data: shop } = await publicClient().rpc("shop_for_token", { link_token: token });
  if (!shop) notFound();
  return (
    <article className="mx-auto max-w-lg p-4 sm:p-10">
      <div className="card space-y-4 p-5">
        <h1 className="font-display text-2xl font-extrabold">
          Stop reminder, review and shop emails?
        </h1>
        <p>
          {String(shop)} sends reminders about open quotes and invoices, asks for a review after a
          job, and sometimes emails its customers news and offers. You can stop these emails here.
        </p>
        <StopForm token={token} shop={String(shop)} />
      </div>
    </article>
  );
}
