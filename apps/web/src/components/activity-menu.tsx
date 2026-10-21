"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ACTIVITY_TITLE, SEARCH_WORDS, activityButtonLabel } from "@leakbook/core";
import { Dot } from "./nav-links";
import { Sheet } from "./sheet";
import { buttonClass, cx } from "./ui";

/**
 * The Dashboard's Activity button, at the right of the title row (owner, 2026-10-21: "make
 * activity a dropdown on the right side at the same level as the title text"): a pill with a
 * chevron and the blue dot when something is new. Wider screens open a popover under it;
 * phones (`sheet`) open a sheet. Either shows the latest events (rendered on the server and
 * passed in as `children`), then See All.
 */
export function ActivityMenu({
  unread,
  sheet = false,
  pending = false,
  children,
}: {
  unread: boolean;
  /** Phones: a sheet from the bottom instead of the popover. */
  sheet?: boolean;
  /** Still loading on the server: the button shows but doesn't open yet. */
  pending?: boolean;
  children?: ReactNode;
}) {
  const [opened, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const titleId = useId();
  const path = usePathname();

  // Leaving the page (a row or See All) closes it.
  const [openedOn, setOpenedOn] = useState(path);
  const open = opened && openedOn === path;

  useEffect(() => {
    if (!open || sheet) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, sheet]);

  const seeAll = (
    <Link
      href="/activity"
      aria-label={`${SEARCH_WORDS.seeAll} ${ACTIVITY_TITLE}`}
      className={buttonClass("quiet", "mt-2 w-full")}
    >
      {SEARCH_WORDS.seeAll}
    </Link>
  );

  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup={sheet ? "dialog" : undefined}
        aria-label={activityButtonLabel(unread)}
        aria-disabled={pending || undefined}
        onClick={() => {
          if (pending) return;
          setOpenedOn(path);
          setOpen(!open);
        }}
        className={buttonClass("secondary", "gap-1.5 px-4 text-[1.0625rem]")}
      >
        {/* Its words are in the button's name. */}
        {unread ? (
          <span aria-hidden="true" className="contents">
            <Dot />
          </span>
        ) : null}
        {ACTIVITY_TITLE}
        <svg
          viewBox="0 0 24 24"
          className={cx("size-4 transition-transform", open && !sheet && "rotate-180")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {sheet ? (
        <Sheet
          open={open}
          onClose={() => setOpen(false)}
          title={ACTIVITY_TITLE}
          cancelLabel="Close"
        >
          <div id={panelId} data-testid="activity-menu">
            {children}
            {seeAll}
          </div>
        </Sheet>
      ) : open ? (
        <div
          ref={panel}
          id={panelId}
          role="region"
          aria-labelledby={titleId}
          tabIndex={-1}
          data-testid="activity-menu"
          onBlur={(e) => {
            // Tabbing past the last link closes it, as a disclosure does.
            const next = e.relatedTarget as Node | null;
            if (next && !wrap.current?.contains(next)) setOpen(false);
          }}
          className="absolute top-full right-0 z-40 mt-2 max-h-[min(32rem,70dvh)] w-[24rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-[1.25rem] bg-bg p-3 shadow-2xl ring-1 ring-separator outline-none motion-safe:animate-[fade-in_0.15s_ease-out]"
        >
          <h2
            id={titleId}
            className="mb-2 px-1 font-sans text-[1.0625rem] font-semibold tracking-normal"
          >
            {ACTIVITY_TITLE}
          </h2>
          {children}
          {seeAll}
        </div>
      ) : null}
    </div>
  );
}
