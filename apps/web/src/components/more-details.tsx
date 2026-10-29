"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** A field's name as its label says it, without "(optional)" or "($)". */
function fieldName(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  const label = el.labels?.[0]?.textContent ?? el.getAttribute("aria-label") ?? "";
  return label.replace(/\s*\((optional|\$)\)\s*/gi, " ").trim();
}

/** The fields filled in inside `root`: typed text, a choice made, a box checked. */
function filledNames(root: HTMLElement): string[] {
  const names: string[] = [];
  root
    .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input:not([type=hidden]), select, textarea",
    )
    .forEach((el) => {
      const filled =
        el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")
          ? el.checked
          : el.value.trim() !== "";
      const name = fieldName(el);
      if (filled && name && !names.includes(name)) names.push(name);
    });
  return names;
}

/**
 * New Job's More Details (owner, 2026-10-29: "New Job in 20 seconds"): one row that opens in
 * place to the fields a call rarely needs. Closed, its fields stay in the form, so drafts and
 * Create Job work unchanged. It opens by itself when a restored draft or an error is inside
 * it, so nothing typed is ever hidden. Its second line lists what's filled in, else what's
 * inside (`hint`).
 */
export function MoreDetails({ hint, children }: { hint: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [filled, setFilled] = useState<string[]>([]);
  const body = useRef<HTMLDivElement>(null);
  const id = useId();
  // After every render, so fields the page fills itself (a price from the price book) count.
  // It sets state only when the list changed, so it settles.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- every render, on purpose
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const next = filledNames(el);
    setFilled((was) => (was.join("|") === next.join("|") ? was : next));
  });
  // An error inside opens it.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- every render: errors come with them
  useEffect(() => {
    if (!open && body.current?.querySelector('[aria-invalid="true"], [id$="-error"]'))
      setOpen(true);
  });
  const refresh = () => {
    const el = body.current;
    if (el) setFilled(filledNames(el));
  };
  return (
    <div
      className="pt-3"
      // Typing can't reach a closed field: input there is a restored draft, so it opens.
      onInput={() => {
        if (!open) setOpen(true);
        refresh();
      }}
      onChange={refresh}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="card flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">More Details</span>
          <span className="block text-[0.9375rem] text-text-muted">
            {filled.length ? `Filled in: ${filled.join(", ")}` : hint}
          </span>
        </span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`size-5 shrink-0 text-text-muted transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div id={id} ref={body} hidden={!open} className="mt-4 space-y-4 card p-4">
        {children}
      </div>
    </div>
  );
}
