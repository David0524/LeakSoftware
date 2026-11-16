import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FeedbackCard } from "@/components/feedback-card";
import { CardSkeleton } from "@/components/page-skeleton";
import { feedbackCard } from "@/server/feedback";

export const metadata: Metadata = { title: "How Did We Do?", robots: { index: false } };

/**
 * From the review request email's thumbs links (owner's competitor notes, 2026-11-16): no
 * sign-in. ?rating=up or down shows that answer; nothing is recorded until the customer acts.
 */
export default function FeedbackPage({ params, searchParams }: PageProps<"/f/[token]">) {
  return (
    <main className="lb-light min-h-full flex-1 bg-bg text-text">
      <Suspense fallback={<CardSkeleton />}>
        <Feedback params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Feedback({ params, searchParams }: PageProps<"/f/[token]">) {
  const { token } = await params;
  const { rating } = await searchParams;
  const card = await feedbackCard(token);
  if (!card) notFound();
  return (
    <article className="mx-auto max-w-lg space-y-4 p-4 sm:p-10">
      <p className="text-[0.9375rem] text-text-muted">{card.company}</p>
      <FeedbackCard
        token={token}
        shop={card.company}
        reviewUrl={card.review_url}
        initial={rating === "up" || rating === "down" ? rating : null}
      />
    </article>
  );
}
