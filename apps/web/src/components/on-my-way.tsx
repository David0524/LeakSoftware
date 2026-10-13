"use client";

import { useState } from "react";
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
  async function send() {
    const arriveMin = localMinutes(new Date().toISOString(), timeZone) + Math.max(5, driveMin);
    const text = onMyWayText({ customer, tech, shop, arriveMin, windowMin });
    if (phone) {
      // "?&body=" works in both iOS and Android Messages.
      window.location.href = `sms:${phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(text)}`;
      setShown(text);
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
      {shown ? (
        <p role="status" className="w-full text-[15px] text-text-muted">
          {shown}
        </p>
      ) : null}
    </>
  );
}
