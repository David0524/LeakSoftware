"use client";

import { useState, useTransition } from "react";
import { FEEDBACK_CARD } from "@leakbook/core";
import { sendFeedback } from "@/app/actions/feedback";
import { NO_CONNECTION, isNoConnection } from "@/lib/offline";
import { Banner } from "./doc-ui";
import { ThumbsDownIcon, ThumbsUpIcon } from "./icons";
import { Button, TextArea, buttonClass } from "./ui";

type Stage = "ask" | "up" | "down" | "sent";

/**
 * "How did we do?" on a customer's page (owner's competitor notes, 2026-11-16): thumbs up or
 * down, no sign-in. Up thanks them and offers the shop's Google review; down asks what went wrong
 * and sends it privately to the shop as a complaint. `initial` is the thumb a review email's link
 * chose: it shows that answer, and nothing is recorded until the customer acts on the page (mail
 * scanners open every link).
 */
export function FeedbackCard({
  token,
  shop,
  reviewUrl,
  initial,
}: {
  token: string;
  shop: string;
  reviewUrl: string | null;
  initial?: "up" | "down" | null;
}) {
  const [stage, setStage] = useState<Stage>(initial ?? "ask");
  const [recorded, setRecorded] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const record = (rating: "up" | "down", words?: string) =>
    new Promise<boolean>((done) =>
      start(async () => {
        setError(null);
        try {
          const result = await sendFeedback(token, rating, words);
          if (result.ok) {
            setRecorded(true);
            done(true);
          } else {
            setError(result.error);
            done(false);
          }
        } catch (e) {
          setError(isNoConnection(e) ? NO_CONNECTION : FEEDBACK_CARD.failed);
          done(false);
        }
      }),
    );

  const up = async () => {
    setStage("up");
    if (!recorded) await record("up");
  };

  return (
    <section className="card space-y-4 p-5" aria-labelledby="feedback-title">
      <h2 id="feedback-title" className="font-display text-xl font-extrabold">
        {FEEDBACK_CARD.title}
      </h2>
      {stage === "ask" ? (
        <div className="flex flex-wrap gap-3">
          <Button kind="secondary" disabled={pending} onClick={up} className="gap-2">
            <ThumbsUpIcon className="size-6" />
            {FEEDBACK_CARD.up}
          </Button>
          <Button
            kind="secondary"
            disabled={pending}
            onClick={() => setStage("down")}
            className="gap-2"
          >
            <ThumbsDownIcon className="size-6" />
            {FEEDBACK_CARD.down}
          </Button>
        </div>
      ) : null}
      {stage === "up" ? (
        <div className="space-y-3">
          <p>{FEEDBACK_CARD.upThanks}</p>
          {reviewUrl ? (
            <>
              <p className="text-[0.9375rem] text-text-muted">{FEEDBACK_CARD.upAsk}</p>
              <a
                href={reviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  // Coming from the email, the thumb is recorded when they go on to review.
                  if (!recorded) void record("up");
                }}
                className={buttonClass("primary")}
              >
                {FEEDBACK_CARD.reviewButton}
              </a>
            </>
          ) : null}
        </div>
      ) : null}
      {stage === "down" ? (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await record("down", comment)) setStage("sent");
          }}
        >
          <TextArea
            label={FEEDBACK_CARD.downPrompt}
            hint={FEEDBACK_CARD.downHint}
            rows={4}
            maxLength={2000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            autoFocus
          />
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? "Sending…" : FEEDBACK_CARD.send}
          </Button>
        </form>
      ) : null}
      {stage === "sent" ? <Banner tone="success">{FEEDBACK_CARD.downThanks(shop)}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
    </section>
  );
}
