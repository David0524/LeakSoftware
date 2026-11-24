"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { NavPlus } from "./nav-bar";
import { ContextMenu } from "./row-actions";
import { useChoice } from "./sheet";

// The "+" that was New Job is a menu of New Job and New Quote (docs/design/
// 2026-11-24-standalone-quotes.md): a menu on a computer, an action sheet on a phone. Shown to
// the same people as New Job was.

const CHOICES = [
  { key: "job", label: "New Job", href: "/jobs/new" },
  { key: "quote", label: "New Quote", href: "/quotes/new" },
] as const;

const Plus = ({ className }: { className: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="2.6"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** The desktop header's blue "+ New" pill, opening New Job and New Quote. */
export function NewMenuPill() {
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={at != null}
        aria-label="New Job or New Quote"
        title="New Job or New Quote"
        data-testid="new-menu"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ x: r.right, y: r.bottom + 4 });
        }}
        className="inline-flex min-h-11 items-center"
      >
        <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[0.9375rem] font-semibold text-on-primary max-lg:px-2.5">
          <Plus className="size-4" />
          <span className="max-lg:sr-only">New</span>
          <svg
            viewBox="0 0 12 8"
            className="h-2 w-3 max-lg:hidden"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m2 2 4 4 4-4" />
          </svg>
        </span>
      </button>
      {at ? (
        <ContextMenu
          title="New"
          hideTitle
          entries={CHOICES.map((c) => ({ label: c.label, href: c.href }))}
          at={at}
          onClose={(refocus) => {
            setAt(null);
            if (refocus) button.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

/** The phone navigation bar's "+": an action sheet with New Job and New Quote. */
export function NewMenuPlus() {
  const router = useRouter();
  const [choose, sheet] = useChoice<(typeof CHOICES)[number]["key"]>();
  return (
    <>
      <NavPlus
        label="New Job or New Quote"
        onClick={async () => {
          const key = await choose({
            title: "New",
            hideTitle: true,
            choices: CHOICES.map(({ key, label }) => ({ key, label })),
          });
          const href = CHOICES.find((c) => c.key === key)?.href;
          if (href) router.push(href);
        }}
      />
      {sheet}
    </>
  );
}
