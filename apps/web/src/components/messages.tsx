"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { saveFailed } from "./instant";
import {
  callCustomer,
  markRead,
  sendMessage,
  setUnread,
  type SendState,
} from "@/app/actions/texting";
import { Banner } from "./doc-ui";
import { CameraIcon, PhoneIcon } from "./icons";
import { Button, cx, iconButtonClass } from "./ui";
import { NO_CONNECTION, orOffline, whenOffline } from "@/lib/offline";

// The Messages inbox's interactive parts (company texting, owner 2026-10-16).

/**
 * Write a text from the company number: words, and photos when the shop allows pictures.
 * A new conversation opens once its first text is sent.
 */
export function Composer({
  conversationId,
  customerId,
  pictures,
  askPhone = false,
  jobId,
}: {
  conversationId?: string;
  customerId?: string;
  pictures: boolean;
  /** A new message to someone who isn't a customer yet: ask for their number. */
  askPhone?: boolean;
  jobId?: string;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const bodyId = useId();
  const phoneId = useId();
  const photosId = useId();
  const [chosen, setChosen] = useState(0);
  // Sent: clear the form, and open a new conversation. Done in the action, not an effect.
  const [state, action, pending] = useActionState(async (prev: SendState, data: FormData) => {
    const next = await orOffline(sendMessage)(prev, data);
    if (next.sentAt) {
      form.current?.reset();
      setChosen(0);
      if (next.conversationId && next.conversationId !== conversationId) {
        router.push(`/messages/${next.conversationId}`);
      }
    }
    return next;
  }, {});

  return (
    <form ref={form} action={action} className="space-y-2">
      {conversationId ? (
        <input type="hidden" name="conversation_id" value={conversationId} />
      ) : null}
      {customerId ? <input type="hidden" name="customer_id" value={customerId} /> : null}
      {jobId ? <input type="hidden" name="job_id" value={jobId} /> : null}
      {askPhone ? (
        <div>
          <label htmlFor={phoneId} className="mb-1 block font-medium">
            To
          </label>
          <input
            id={phoneId}
            name="phone"
            type="tel"
            autoComplete="off"
            required
            placeholder="Mobile number"
            className="block min-h-11 w-full rounded-[10px] border border-control-border bg-surface px-3 text-text placeholder:text-placeholder focus:outline-3 focus:outline-focus"
          />
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        {pictures ? (
          <>
            <label
              htmlFor={photosId}
              className={iconButtonClass("cursor-pointer has-[:focus-visible]:outline-3")}
            >
              <CameraIcon />
              <span className="sr-only">Add Photos</span>
            </label>
            <input
              id={photosId}
              name="pictures"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/heic"
              multiple
              className="sr-only"
              onChange={(e) => setChosen(e.currentTarget.files?.length ?? 0)}
            />
          </>
        ) : null}
        <label htmlFor={bodyId} className="sr-only">
          Message
        </label>
        <textarea
          id={bodyId}
          name="body"
          rows={2}
          maxLength={1600}
          placeholder="Text message"
          onKeyDown={(e) => {
            // Enter sends, as in Messages; Shift-Enter starts a new line.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              form.current?.requestSubmit();
            }
          }}
          className="block min-h-11 min-w-0 flex-1 resize-y rounded-[1.375rem] border border-control-border bg-surface px-4 py-2.5 text-text placeholder:text-placeholder focus:outline-3 focus:outline-focus"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </Button>
      </div>
      {chosen > 0 ? (
        <p className="text-[0.9375rem] text-text-muted">
          {chosen === 1 ? "1 photo" : `${chosen} photos`} attached
        </p>
      ) : null}
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
      <p role="status" className="sr-only">
        {state.sentAt ? "Sent." : ""}
      </p>
    </form>
  );
}

/** Ring my phone, then connect me to the customer from the company number. */
export function CallButton({ conversationId, name }: { conversationId: string; name: string }) {
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={pending}
        aria-label={`Call ${name} from the company number`}
        className={iconButtonClass("disabled:opacity-50")}
        onClick={() =>
          start(async () =>
            setResult(await whenOffline(callCustomer(conversationId), { error: NO_CONNECTION })),
          )
        }
      >
        <PhoneIcon />
      </button>
      {result ? (
        <div className="max-w-xs">
          <Banner tone={result.error ? "error" : "info"}>{result.error ?? result.message}</Banner>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Mark as Unread from inside a conversation (the way without swiping): unread for the whole
 * team. Phones go back to the list, as in Mail; wider screens, where the list is beside it,
 * stay (MarkRead won't mark it read again until a new message comes in).
 */
export function MarkUnreadButton({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      kind="secondary"
      disabled={pending}
      onClick={() => {
        // Phones go back to the list at once (owner, 2026-10-22: changes show instantly); the
        // save follows, and one that fails says so in the top banner.
        const phone = !window.matchMedia("(min-width: 768px)").matches;
        if (phone) router.push("/messages?list=1");
        start(async () => {
          const r = await whenOffline(setUnread(conversationId, true), { error: NO_CONNECTION });
          if (r.error) saveFailed("Couldn’t mark it unread. Try again.");
          else if (!phone) router.refresh();
        });
      }}
    >
      Mark as Unread
    </Button>
  );
}

/**
 * Opening a conversation marks it read for the whole team, and so does a new message while it
 * is open. Marking it unread while looking at it sticks: the same latest message is never
 * marked read twice.
 */
export function MarkRead({
  conversationId,
  unread,
  lastAt,
}: {
  conversationId: string;
  unread: boolean;
  lastAt: string;
}) {
  const seen = useRef<string | null>(null);
  useEffect(() => {
    const key = `${conversationId}@${lastAt}`;
    if (seen.current === key) return;
    seen.current = key;
    if (unread) void markRead(conversationId);
  }, [conversationId, unread, lastAt]);
  return null;
}

/** New texts and calls appear without reloading (every 10 s while the page is showing). */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

/** Scroll a thread to its newest message. */
export function ScrollToEnd({ count }: { count: number }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [count]);
  return <div ref={end} className={cx("h-px")} />;
}
