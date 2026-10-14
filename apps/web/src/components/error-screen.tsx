"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonClass } from "./ui";

/**
 * What a page shows when something breaks (M11): what happened in plain words, Try Again,
 * and a way out. The error goes to Sentry when it is set up; the code helps support find it.
 */
export function ErrorScreen({
  error,
  retry,
  home = "/today",
}: {
  error: Error & { digest?: string };
  retry: () => void;
  home?: string;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-lg py-16 text-center">
      <h1 className="font-display text-3xl font-extrabold">Something went wrong</h1>
      <p className="mt-3 text-text-muted">
        This page didn’t load. Try again, or go back and come here later. Nothing you already saved
        is lost.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button type="button" onClick={() => retry()}>
          Try Again
        </Button>
        <Link href={home} className={buttonClass("secondary")}>
          Go to Today
        </Link>
      </div>
      {error.digest ? (
        <p className="mt-6 text-[15px] text-text-muted">Error code {error.digest}</p>
      ) : null}
    </div>
  );
}
