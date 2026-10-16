"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { localMinutes, onMyWayText, type OnMyWayVia } from "@leakbook/core";
import { sendMessage } from "@/app/actions/texting";
import { Sheet, useConfirm } from "./sheet";
import { buttonClass } from "./ui";

/**
 * On My Way: a text to the customer with an arrival time (now plus the drive). By default
 * (Settings › Phone and Texting, owner 2026-10-16) Tidemark sends it from the company number,
 * into the shared Messages; without a working number it asks before using the tech's phone.
 * Shops can choose the tech's own phone instead: the Messages app when the customer has a
 * phone number, else the share sheet.
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
  via = "messages",
  lineActive = false,
  isOwner = false,
  jobId,
}: {
  phone: string | null;
  customer: string | null;
  tech: string;
  shop: string;
  driveMin: number;
  windowMin: number;
  timeZone: string;
  className?: string;
  /** Where the shop sends On My Way from. */
  via?: OnMyWayVia;
  /** The shop has a working company number. */
  lineActive?: boolean;
  isOwner?: boolean;
  jobId?: string;
}) {
  const textId = useId();
  // What just happened: the button says so for a moment (no toast), and screen readers hear it.
  const [done, setDone] = useState<{ label: string; spoken: string } | null>(null);
  // Neither sharing nor copying worked: the text in a sheet, to copy by hand.
  const [manual, setManual] = useState<string | null>(null);
  const closeManual = useCallback(() => setManual(null), []);
  const [confirm, confirmSheet] = useConfirm();
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 3000);
    return () => clearTimeout(t);
  }, [done]);
  async function send() {
    const arriveMin = localMinutes(new Date().toISOString(), timeZone) + Math.max(5, driveMin);
    const text = onMyWayText({ customer, tech, shop, arriveMin, windowMin });
    if (phone && via === "messages" && !lineActive) {
      const fromPhone = await confirm({
        title: "On My Way goes out from your company number, which isn’t working yet.",
        message: isOwner
          ? "Set it up in Settings › Phone and Texting. You can send this one from your phone."
          : "Ask an owner to set it up. You can send this one from your phone.",
        confirmLabel: "Send From My Phone",
      });
      if (!fromPhone) return;
    }
    if (phone && via === "messages" && lineActive) {
      const form = new FormData();
      form.set("phone", phone);
      form.set("body", text);
      if (jobId) form.set("job_id", jobId);
      setDone({ label: "Sending…", spoken: "" });
      const sent = await sendMessage({}, form);
      setDone(
        sent.error
          ? { label: "Not Sent", spoken: sent.error }
          : { label: "Texted ✓", spoken: `Texted from the company number: ${text}` },
      );
      return;
    }
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
      {confirmSheet}
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
