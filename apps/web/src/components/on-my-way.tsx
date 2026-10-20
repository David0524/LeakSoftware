"use client";

import { useCallback, useEffect, useId, useState, useTransition } from "react";
import { localMinutes, onMyWayText, type OnMyWayVia } from "@leakbook/core";
import { sendMessage } from "@/app/actions/texting";
import { recordOnMyWay } from "@/app/actions/inspection";
import { Sheet, useConfirm } from "./sheet";
import { CarIcon, CheckIcon, MessageIcon } from "./icons";
import { showBanner } from "./top-banner";
import { buttonClass, cx, iconButtonClass } from "./ui";

/** On My Way's words now: the arrival is now plus the drive (at least 5 minutes). */
export function onMyWayNow(input: {
  customer: string | null;
  tech: string;
  shop: string;
  driveMin: number;
  windowMin: number;
  timeZone: string;
}): { text: string; arriveAt: string } {
  const lead = Math.max(5, input.driveMin);
  const arriveMin = localMinutes(new Date().toISOString(), input.timeZone) + lead;
  return {
    text: onMyWayText({
      customer: input.customer,
      tech: input.tech,
      shop: input.shop,
      arriveMin,
      windowMin: input.windowMin,
    }),
    arriveAt: new Date(Date.now() + lead * 60_000).toISOString(),
  };
}

/** The phone's own Messages with this text filled in ("?&body=" works on iOS and Android). */
export function smsHref(phone: string, body?: string): string {
  const to = `sms:${phone.replace(/[^\d+]/g, "")}`;
  return body ? `${to}?&body=${encodeURIComponent(body)}` : to;
}

/**
 * Today's card's Message button on the tech's own stop before they leave (owner, 2026-10-20:
 * "the message button should default to the 'on my way' text … but the tech can always edit
 * the message"; gestures.md section 2). With the shop's number it opens a compose sheet filled
 * in with On My Way, sent from that number; without it, the phone's Messages with the text filled
 * in. Either way the job records On My Way (on_my_way_at, arrive_at), as the car button did, so
 * the card and the Live Activity move to "On the way".
 */
export function OnMyWayMessage({
  phone,
  customer,
  tech,
  shop,
  driveMin,
  windowMin,
  timeZone,
  via,
  lineActive,
  jobId,
  className,
}: {
  phone: string;
  customer: string;
  tech: string;
  shop: string;
  driveMin: number;
  windowMin: number;
  timeZone: string;
  via: OnMyWayVia;
  lineActive: boolean;
  jobId: string;
  className: string;
}) {
  const textId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const close = useCallback(() => {
    setDraft(null);
    setError(null);
  }, []);
  const now = () => onMyWayNow({ customer, tech, shop, driveMin, windowMin, timeZone });
  const label = `Text ${customer}, On My Way`;

  if (via !== "messages" || !lineActive)
    return (
      <a
        href={smsHref(phone)}
        aria-label={label}
        className={className}
        onClick={(e) => {
          // The words and arrival as of the tap, then recorded as the old fallback did.
          const { text, arriveAt } = now();
          e.currentTarget.href = smsHref(phone, text);
          void recordOnMyWay(jobId, arriveAt);
        }}
      >
        <MessageIcon />
      </a>
    );

  const send = () =>
    start(async () => {
      const body = draft?.trim() ?? "";
      if (!body) return;
      const { arriveAt } = now();
      const form = new FormData();
      form.set("phone", phone);
      form.set("body", body);
      form.set("job_id", jobId);
      const sent = await sendMessage({}, form);
      if (sent.error) {
        setError(sent.error);
        return;
      }
      await recordOnMyWay(jobId, arriveAt);
      close();
      showBanner({ message: `On My Way sent to ${customer}` });
    });

  return (
    <>
      <button
        type="button"
        aria-label={label}
        className={className}
        onClick={() => setDraft(now().text)}
      >
        <MessageIcon />
      </button>
      <Sheet open={draft !== null} onClose={close} title={`Text ${customer}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="space-y-3"
        >
          <label htmlFor={textId} className="sr-only">
            Message to {customer}
          </label>
          <textarea
            id={textId}
            value={draft ?? ""}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="block w-full rounded-[10px] border border-control-border bg-surface p-3 text-[1.0625rem] text-text"
          />
          <p className="text-[0.9375rem] text-text-muted">
            From the company number. Sending it marks you On My Way.
          </p>
          {error ? (
            <p role="alert" className="text-[0.9375rem] text-status-fail">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending || !draft?.trim()}
            className={cx(buttonClass("primary"), "w-full")}
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </form>
      </Sheet>
    </>
  );
}

/**
 * On My Way: a text to the customer with an arrival time (now plus the drive). By default
 * (Settings › Phone and Texting, owner 2026-10-16) Sundeck Pro sends it from the company number,
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
  buttonClassName,
  icon = false,
}: {
  /**
   * A round icon button (a car) instead of the words (owner, 2026-10-20: "make the 'on my way'
   * text to just be an icon"); named "On My Way" for screen readers and on hover.
   */
  icon?: boolean;
  /** The whole button's look, in place of the secondary button (Today's card). */
  buttonClassName?: string;
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
    // Kept on the job once it's on its way to the customer (Today's card, 2026-10-20).
    const record = () => {
      if (jobId)
        void recordOnMyWay(
          jobId,
          new Date(Date.now() + Math.max(5, driveMin) * 60_000).toISOString(),
        );
    };
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
      if (!sent.error) record();
      return;
    }
    if (phone) {
      // "?&body=" works in both iOS and Android Messages.
      record();
      window.location.href = `sms:${phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(text)}`;
      setDone({ label: "Texted ✓", spoken: `Opened Messages with the text: ${text}` });
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ text });
        record();
        setDone({ label: "Shared ✓", spoken: "Shared the text." });
        return;
      } catch (e) {
        // Closing the share sheet isn't a failure.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      record();
      setDone({ label: "Copied ✓", spoken: `Copied the text: ${text}` });
    } catch {
      setManual(text);
    }
  }
  return (
    <>
      {icon ? (
        <button
          type="button"
          aria-label={done?.label ?? `On My Way to ${customer ?? "the customer"}`}
          title={done?.label ?? "On My Way"}
          className={buttonClassName ?? iconButtonClass(className)}
          onClick={send}
        >
          {done ? <CheckIcon className="size-5" /> : <CarIcon className="size-5" />}
        </button>
      ) : (
        <button
          type="button"
          className={buttonClassName ?? buttonClass("secondary", className)}
          onClick={send}
        >
          {done?.label ?? "On My Way"}
        </button>
      )}
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
