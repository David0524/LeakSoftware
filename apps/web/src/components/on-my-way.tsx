"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { localMinutes, onMyWayText } from "@leakbook/core";
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
  const [shown, setShown] = useState<string | null>(null);
  // The notice clears itself; it never sits inside the stop's card (it used to push the card
  // apart with the whole message).
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 8000);
    return () => clearTimeout(t);
  }, [shown]);
  async function send() {
    const arriveMin = localMinutes(new Date().toISOString(), timeZone) + Math.max(5, driveMin);
    const text = onMyWayText({ customer, tech, shop, arriveMin, windowMin });
    if (phone) {
      // "?&body=" works in both iOS and Android Messages.
      window.location.href = `sms:${phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(text)}`;
      setShown(`Opened Messages: ${text}`);
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setShown(`Copied: ${text}`);
    } catch {
      setShown(text);
    }
  }
  return (
    <>
      <button type="button" className={buttonClass("secondary", className)} onClick={send}>
        On My Way
      </button>
      {shown
        ? createPortal(
            <div
              role="status"
              className="fixed inset-x-4 bottom-28 z-40 mx-auto flex max-w-md items-start gap-2 rounded-2xl bg-text p-3 text-[0.9375rem] text-bg shadow-lg sm:bottom-6"
            >
              <p className="min-w-0 flex-1">{shown}</p>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShown(null)}
                className="-m-2 grid size-11 shrink-0 place-items-center rounded-full font-bold"
              >
                ✕
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
