"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "./ui";

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
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  cancelLabel?: string;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // The page behind stays put while the sheet is up.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [open, onClose]);

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
    if (drag > 90) onClose();
    setDrag(0);
  };

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/40 motion-safe:animate-[fade-in_0.2s_ease-out]"
        onClick={onClose}
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
          "motion-safe:animate-[sheet-up_0.28s_cubic-bezier(0.32,0.72,0,1)] sm:max-w-lg sm:rounded-[1.25rem] sm:pb-0",
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
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 justify-self-start rounded-full px-3 text-link"
            >
              {cancelLabel}
            </button>
            <h2 id={titleId} className="truncate px-2 font-sans text-[1.0625rem] font-semibold">
              {title}
            </h2>
            <span />
          </div>
        </div>
        <div className="overflow-y-auto px-4 pb-6">{children}</div>
      </div>
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
  destructive?: boolean;
}

/**
 * An iOS action sheet for confirming an action (in place of the browser's confirm box). Use:
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
  const sheet = pending ? <ActionSheet {...pending} onDone={finish} /> : null;
  return [confirm, sheet];
}

function ActionSheet({
  title,
  message,
  confirmLabel,
  destructive,
  onDone,
}: ConfirmOptions & { onDone: (ok: boolean) => void }) {
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [onDone]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/40"
        onClick={() => onDone(false)}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md space-y-2 motion-safe:animate-[sheet-up_0.25s_cubic-bezier(0.32,0.72,0,1)]"
      >
        <div className="glass-sheet overflow-hidden rounded-[0.875rem] text-center">
          <div className="px-4 py-3">
            <p id={titleId} className="text-[0.8125rem] font-semibold text-text-muted">
              {title}
            </p>
            {message ? <p className="mt-1 text-[0.8125rem] text-text-muted">{message}</p> : null}
          </div>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onDone(true)}
            className={cx(
              "block min-h-14 w-full border-t-[0.5px] border-separator text-[1.25rem]",
              destructive ? "text-status-fail" : "text-link",
            )}
          >
            {confirmLabel}
          </button>
        </div>
        <button
          type="button"
          onClick={() => onDone(false)}
          className="glass-sheet block min-h-14 w-full rounded-[0.875rem] text-[1.25rem] font-semibold text-link"
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}
