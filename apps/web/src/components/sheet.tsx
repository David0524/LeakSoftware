"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { DISCARD_PROMPT, fieldsOf, signature } from "@/lib/dirty";
import { backQuietly, onBack, pushEntry } from "@/lib/history-entry";
import { buttonClass, cx } from "./ui";

/**
 * A sheet, as on iOS (sheets.md): it slides up from the bottom on phones with a grabber, and
 * closes with a swipe down, the Cancel button, Escape, or a tap outside. Wider screens show it
 * as a centered dialog. One short task per sheet.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  cancelLabel = "Cancel",
  wide = false,
  done,
  doneOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  cancelLabel?: string;
  /** Wider screens: a large dialog (a map beside its list) instead of the narrow one. */
  wide?: boolean;
  /** A bold Done (or Save) at the trailing end of the title bar, as iOS sheets have. */
  done?: { label: string; onClick: () => void; disabled?: boolean };
  /**
   * Only a bold Done at the trailing end, which closes the sheet (asking first when something
   * changed): for a sheet whose edits save as they're made, such as a Wrap-Up step.
   */
  doneOnly?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);
  const [confirm, confirmSheet] = useConfirm();
  // What the fields held when the sheet opened: closing with anything else asks first
  // (owner, 2026-10-20: "Discard changes, everywhere"). Saving closes through the caller,
  // not through here, so it never asks.
  const opened = useRef<string | null>(null);
  const asking = useRef(false);
  // Closed from the sheet itself (Cancel, Escape, a tap outside, a swipe), not by a save.
  const cancelled = useRef(false);
  const latestClose = useRef(onClose);
  useEffect(() => {
    latestClose.current = onClose;
  });
  const dirty = () =>
    !!panel.current &&
    opened.current !== null &&
    signature(fieldsOf(panel.current)) !== opened.current;
  const requestClose = useCallback(async () => {
    if (asking.current) return;
    if (dirty()) {
      asking.current = true;
      const discard = await confirm(DISCARD_PROMPT);
      asking.current = false;
      if (!discard) return false;
    }
    cancelled.current = true;
    latestClose.current();
    return true;
  }, [confirm]);

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      // Escape in an alert over the sheet answers the alert only.
      if (e.key === "Escape" && !document.querySelector("[role=alertdialog]")) void requestClose();
    };
    document.addEventListener("keydown", onKey);
    // The page behind stays put while the sheet is up.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    // The fields once the content has rendered (controlled fields set their values then).
    const settle = window.setTimeout(() => {
      if (panel.current) opened.current = signature(fieldsOf(panel.current));
    }, 0);
    // The browser's Back closes the sheet (asking first when something changed) instead of
    // leaving the page: an entry for the sheet, taken off again when it's cancelled.
    let entry = true;
    cancelled.current = false;
    const href = location.href;
    pushEntry();
    const stopBack = onBack(() => {
      if (!entry) return false;
      entry = false;
      if (!dirty()) {
        latestClose.current();
        return true;
      }
      // Stay: put the entry back while asking.
      pushEntry();
      entry = true;
      void requestClose();
      return true;
    });
    return () => {
      window.clearTimeout(settle);
      opened.current = null;
      stopBack();
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
      // Cancelled: take the sheet's entry off. After a save it stays (Back from it shows this
      // same page once): taking it off then raced the page refreshing after the save and lost
      // what the save showed (the route board's "Moved to…").
      if (entry && cancelled.current && location.href === href) backQuietly();
    };
    // requestClose is stable; the effect runs once per opening.
  }, [open, requestClose]);

  // Swipe down on the grabber or title bar to close.
  const down = (e: PointerEvent) => {
    start.current = e.clientY;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (start.current != null) setDrag(Math.max(0, e.clientY - start.current));
  };
  const up = () => {
    if (start.current == null) return;
    start.current = null;
    if (drag > 90) void requestClose();
    setDrag(0);
  };

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/40 motion-safe:animate-[fade-in_0.2s_ease-out]"
        onClick={() => void requestClose()}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        className={cx(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[1.25rem] bg-bg pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none",
          "motion-safe:animate-[sheet-up_0.28s_cubic-bezier(0.32,0.72,0,1)] sm:rounded-[1.25rem] sm:pb-0",
          wide ? "sm:max-w-4xl" : "sm:max-w-lg",
        )}
      >
        <div
          className="shrink-0 touch-none select-none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <div
            aria-hidden="true"
            className="mx-auto mt-2 h-1.5 w-9 rounded-full bg-text/25 sm:hidden"
          />
          <div className="grid grid-cols-[1fr_auto_1fr] items-center px-2 pt-1 pb-2">
            {doneOnly ? (
              <span />
            ) : (
              <button
                type="button"
                onClick={() => void requestClose()}
                className="min-h-11 justify-self-start rounded-full px-3 text-link"
              >
                {cancelLabel}
              </button>
            )}
            <h2 id={titleId} className="truncate px-2 font-sans text-[1.0625rem] font-semibold">
              {title}
            </h2>
            {doneOnly ? (
              <button
                type="button"
                onClick={() => void requestClose()}
                className="min-h-11 justify-self-end rounded-full px-3 font-semibold text-link"
              >
                Done
              </button>
            ) : done ? (
              <button
                type="button"
                onClick={done.onClick}
                disabled={done.disabled}
                className="min-h-11 justify-self-end rounded-full px-3 font-semibold text-link disabled:opacity-50"
              >
                {done.label}
              </button>
            ) : (
              <span />
            )}
          </div>
        </div>
        <div className="overflow-y-auto px-4 pb-6">{children}</div>
      </div>
      {confirmSheet}
    </div>,
    document.body,
  );
}

interface ConfirmOptions {
  /** What is about to happen, as a short sentence. */
  title: string;
  message?: string;
  /** The action's name, e.g. "Delete Test". */
  confirmLabel: string;
  /** The way back, "Cancel" unless given (e.g. "Keep Editing"). */
  cancelLabel?: string;
  destructive?: boolean;
  /**
   * A question about what happens next, such as sending the visit report (owner, 2026-10-20).
   * The website shows every confirmation the same way (DialogFrame); kept for callers and for
   * the apps' wording, where it is a centered alert rather than an action sheet.
   */
  alert?: boolean;
}

/**
 * A dialog for confirming an action (in place of the browser's confirm box). Use:
 *   const [confirm, confirmSheet] = useConfirm();
 *   if (await confirm({ title: "Delete this test?", confirmLabel: "Delete Test", destructive: true })) ...
 *   ... render {confirmSheet} somewhere in the component.
 */
export function useConfirm(): [(o: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [pending, setPending] = useState<
    (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  >(null);
  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...o, resolve })),
    [],
  );
  const finish = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };
  return [confirm, pending ? <ConfirmDialog {...pending} onDone={finish} /> : null];
}

// The website's own dialog (owner, 2026-10-25: "I don't like how the popup on web mimics
// Apple"; option A of the sketch): a white card with the title and message on the left and
// pill buttons at the bottom right, centered on wider screens. On phones it rises from the
// bottom with full-width buttons, the action on top. The apps keep their system alerts.
// Gray for the way back, filled red for a destructive action, filled blue otherwise.
const PLAIN = "bg-fill text-text hover:brightness-95 active:brightness-90";
const FILLED_RED = "bg-status-fail text-on-status hover:brightness-110 active:brightness-95";
const TINTED_RED = "bg-status-fail/12 text-status-fail hover:bg-status-fail/18";

function DialogFrame({
  title,
  message,
  onDismiss,
  initialFocus,
  testId,
  children,
}: {
  title: string;
  message?: string;
  onDismiss: () => void;
  initialFocus: RefObject<HTMLButtonElement | null>;
  testId?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const messageId = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    initialFocus.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [onDismiss, initialFocus]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-header/45 motion-safe:animate-[fade-in_0.2s_ease-out]"
        onClick={onDismiss}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        data-testid={testId}
        className="relative w-full max-w-[26.25rem] rounded-[1.25rem] bg-surface p-6 shadow-2xl motion-safe:animate-[sheet-up_0.25s_cubic-bezier(0.32,0.72,0,1)] sm:motion-safe:animate-[fade-in_0.2s_ease-out]"
      >
        <h2 id={titleId} className="font-display text-[1.625rem] leading-tight">
          {title}
        </h2>
        {message ? (
          <p id={messageId} className="mt-2 text-text-muted">
            {message}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:flex-wrap sm:justify-end">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  onDone,
}: ConfirmOptions & { onDone: (ok: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dismiss = useCallback(() => onDone(false), [onDone]);
  return (
    <DialogFrame
      title={title}
      message={message}
      onDismiss={dismiss}
      // A destructive action is never the default: the way back is.
      initialFocus={destructive ? cancelRef : confirmRef}
    >
      <button
        ref={cancelRef}
        type="button"
        onClick={dismiss}
        className={buttonClass("quiet", cx("w-full sm:w-auto", PLAIN))}
      >
        {cancelLabel}
      </button>
      <button
        ref={confirmRef}
        type="button"
        onClick={() => onDone(true)}
        className={
          destructive
            ? buttonClass("quiet", cx("w-full sm:w-auto", FILLED_RED))
            : buttonClass("primary", "w-full sm:w-auto")
        }
      >
        {confirmLabel}
      </button>
    </DialogFrame>
  );
}

export interface ChoiceOptions<K extends string> {
  /** The question, as a short title ("Move Ana Ruiz's visits?"). */
  title: string;
  message?: string;
  /** The buttons, top to bottom; Cancel is added under them. */
  choices: readonly { key: K; label: string; destructive?: boolean }[];
}

/**
 * A dialog with several choices and Cancel: resolves with the chosen key, or null for Cancel,
 * Escape, or a tap outside. Use:
 *   const [choose, chooseSheet] = useChoice<"plan" | "visit">();
 *   const pick = await choose({ title, choices: [...] });
 *   ... render {chooseSheet} somewhere in the component.
 */
export function useChoice<K extends string>(): [
  (o: ChoiceOptions<K>) => Promise<K | null>,
  ReactNode,
] {
  const [pending, setPending] = useState<
    (ChoiceOptions<K> & { resolve: (k: K | null) => void }) | null
  >(null);
  const choose = useCallback(
    (o: ChoiceOptions<K>) => new Promise<K | null>((resolve) => setPending({ ...o, resolve })),
    [],
  );
  const finish = useCallback(
    (k: K | null) => {
      pending?.resolve(k);
      setPending(null);
    },
    [pending],
  );
  return [choose, pending ? <ChoiceSheet {...pending} onDone={finish} /> : null];
}

function ChoiceSheet<K extends string>({
  title,
  message,
  choices,
  onDone,
}: ChoiceOptions<K> & { onDone: (k: K | null) => void }) {
  const first = useRef<HTMLButtonElement>(null);
  const dismiss = useCallback(() => onDone(null), [onDone]);
  return (
    <DialogFrame
      title={title}
      message={message}
      onDismiss={dismiss}
      initialFocus={first}
      testId="choice-sheet"
    >
      <button
        type="button"
        onClick={dismiss}
        className={buttonClass("quiet", cx("w-full sm:order-last sm:w-auto", PLAIN))}
      >
        Cancel
      </button>
      <div className="flex w-full flex-col gap-2.5">
        {choices.map((c, i) => (
          <button
            key={c.key}
            ref={i === 0 ? first : undefined}
            type="button"
            onClick={() => onDone(c.key)}
            className={buttonClass(
              c.destructive ? "quiet" : "secondary",
              cx("w-full", c.destructive && TINTED_RED),
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
    </DialogFrame>
  );
}
