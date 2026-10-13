import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StopForm } from "@/components/stop-form";
import { publicClient } from "@/server/reports";

export const metadata: Metadata = { title: "Email Preferences", robots: { index: false } };

/** From the link at the bottom of a reminder or review email: no sign-in. */
export default function StopPage({ params }: PageProps<"/stop/[token]">) {
  return (
    <main className="lb-light min-h-full flex-1 bg-paper text-text">
      <Suspense fallback={<p className="p-8 text-center text-neutral-500">Loading…</p>}>
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
    <article className="mx-auto max-w-lg space-y-4 p-6 sm:p-10">
      <h1 className="font-display text-2xl font-extrabold">Stop reminder and review emails?</h1>
      <p>
        {String(shop)} sends reminders about open quotes and invoices, and asks for a review after a
        job. You can stop these emails here.
      </p>
      <StopForm token={token} shop={String(shop)} />
    </article>
  );
}
