import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { UNSUBSCRIBE_TEXT } from "@leakbook/core";
import { UnsubscribeForm } from "@/components/unsubscribe-form";
import { publicClient } from "@/server/reports";
import { CardSkeleton } from "@/components/page-skeleton";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

/** From the link at the bottom of a mass email (Email Customers, 2026-10-22): no sign-in. */
export default function UnsubscribePage({ params }: PageProps<"/unsubscribe/[token]">) {
  return (
    <main className="lb-light min-h-full flex-1 bg-bg text-text">
      <Suspense fallback={<CardSkeleton />}>
        <Unsubscribe params={params} />
      </Suspense>
    </main>
  );
}

async function Unsubscribe({ params }: { params: PageProps<"/unsubscribe/[token]">["params"] }) {
  const { token } = await params;
  // A test email's link ("Send Test to Me") goes nowhere real.
  if (token === "test")
    return (
      <article className="mx-auto max-w-lg p-4 sm:p-10">
        <div className="card space-y-4 p-5">
          <h1 className="font-display text-2xl font-extrabold">Unsubscribe</h1>
          <p>{UNSUBSCRIBE_TEXT.test}</p>
        </div>
      </article>
    );
  const { data: shop } = await publicClient().rpc("unsubscribe_shop", { link_token: token });
  if (!shop) notFound();
  return (
    <article className="mx-auto max-w-lg p-4 sm:p-10">
      <div className="card space-y-4 p-5">
        <h1 className="font-display text-2xl font-extrabold">
          {UNSUBSCRIBE_TEXT.title(String(shop))}
        </h1>
        <p>{UNSUBSCRIBE_TEXT.body(String(shop))}</p>
        <UnsubscribeForm token={token} shop={String(shop)} />
      </div>
    </article>
  );
}
