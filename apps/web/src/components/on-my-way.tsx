"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { localMinutes, onMyWayText } from "@leakbook/core";
import { Sheet } from "./sheet";
import { buttonClass } from "./ui";

/**
 * On My Way: a text to the customer with an arrival time (now plus the drive), sent from the
 * tech's own phone: the Messages app when the customer has a phone number, otherwise the
 * share sheet. Nothing is sent by Tidemark.
 */
export function OnMyWay({
  phone,
  customer,
  tech,
  shop,
  driveMin,
  windowMin,
  timeZone,
  className,
}: {
  phone: string | null;
  customer: string | null;
  tech: string;
  shop: string;
  driveMin: number;
  windowMin: number;
  timeZone: string;
  className?: string;
}) {
  const textId = useId();
  // What just happened: the button says so for a moment (no toast), and screen readers hear it.
  const [done, setDone] = useState<{ label: string; spoken: string } | null>(null);
  // Neither sharing nor copying worked: the text in a sheet, to copy by hand.
  const [manual, setManual] = useState<string | null>(null);
  const closeManual = useCallback(() => setManual(null), []);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 3000);
    return () => clearTimeout(t);
  }, [done]);
  async function send() {
    const arriveMin = localMinutes(new Date().toISOString(), timeZone) + Math.max(5, driveMin);
    const text = onMyWayText({ customer, tech, shop, arriveMin, windowMin });
    if (phone) {
      // "?&body=" works in both iOS and Android Messages.
      window.location.href = `sms:${phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(text)}`;
      setDone({ label: "Texted ✓", spoken: `Opened Messages with the text: ${text}` });
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ text });
        setDone({ label: "Shared ✓", spoken: "Shared the text." });
        return;
      } catch (e) {
        // Closing the share sheet isn't a failure.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setDone({ label: "Copied ✓", spoken: `Copied the text: ${text}` });
    } catch {
      setManual(text);
    }
  }
  return (
    <>
      <button type="button" className={buttonClass("secondary", className)} onClick={send}>
        {done?.label ?? "On My Way"}
      </button>
      <span role="status" className="sr-only">
        {done?.spoken ?? ""}
      </span>
      <Sheet open={manual !== null} onClose={closeManual} title="On My Way Text">
        <p className="mb-3 text-[0.9375rem] text-text-muted">
          This browser couldn’t share or copy it. Select the text, copy it, and send it to{" "}
          {customer ?? "the customer"}.
        </p>
        <label htmlFor={textId} className="sr-only">
          On My Way text
        </label>
        <textarea
          id={textId}
          readOnly
          value={manual ?? ""}
          rows={4}
          onFocus={(e) => e.currentTarget.select()}
          className="block w-full rounded-[10px] border border-control-border bg-surface p-3 text-text"
        />
      </Sheet>
    </>
  );
}
