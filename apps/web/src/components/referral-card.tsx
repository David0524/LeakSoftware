"use client";

import { useState, useSyncExternalStore } from "react";
import { referralCountText, referralShareText } from "@leakbook/core";
import { Button } from "./ui";

const noChanges = () => () => {};

/**
 * Give a Month, Get a Month (owner, 2026-11-23): the shop's referral code (its name), Copy Code
 * and Share, and how many shops used it. Share uses the phone's share sheet where there is one;
 * elsewhere it copies the whole message.
 */
export function ReferralCard({
  code,
  used,
  earned,
  signUpUrl,
}: {
  code: string;
  used: number;
  earned: number;
  signUpUrl: string;
}) {
  const [copied, setCopied] = useState<"code" | "message" | null>(null);
  // A share sheet (phones, Safari): known only in the browser.
  const canShare = useSyncExternalStore(
    noChanges,
    () => "share" in navigator,
    () => false,
  );
  const message = referralShareText(code, signUpUrl);
  const copy = async (text: string, what: "code" | "message") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard refused (an old browser): the code stays on screen to copy by hand.
    }
  };
  return (
    <div className="space-y-4" data-testid="referral-card">
      <p>
        Share your code with another pool company. They get an extra month free, and you get a free
        month once they start paying.
      </p>
      <div className="rounded-xl bg-bg px-4 py-3">
        <p className="text-[0.8125rem] text-text-muted uppercase">Your code</p>
        <p
          className="font-display text-[1.75rem] leading-tight font-extrabold tracking-wide break-all"
          data-testid="referral-code"
        >
          {code}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="button" kind="secondary" onClick={() => copy(code, "code")}>
          {copied === "code" ? "Copied" : "Copy Code"}
        </Button>
        <Button
          type="button"
          onClick={async () => {
            if (canShare) {
              try {
                await navigator.share({ text: message });
              } catch {
                // Closed the share sheet.
              }
            } else await copy(message, "message");
          }}
        >
          {copied === "message" ? "Message Copied" : canShare ? "Share" : "Copy Message"}
        </Button>
      </div>
      <p className="text-[0.9375rem] text-text-muted" data-testid="referral-count">
        {referralCountText(used, earned)}
      </p>
    </div>
  );
}
