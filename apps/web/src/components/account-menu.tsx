"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut, switchCompany } from "@/app/actions/auth";
import { ThemeToggle } from "./theme-toggle";
import { cx } from "./ui";

/** Up to two initials from a name, or the email's first letter. */
function initials(name: string | null, email: string) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = words.length ? words.slice(0, 2).map((w) => w[0]) : [email[0]];
  return letters.join("").toUpperCase();
}

/**
 * Wider screens: who's signed in, as a round button at the end of the header. It opens the
 * shop (and switching shops), appearance, Account and Help, and Sign Out, so the header stays
 * one row (owner, 2026-10-18).
 */
export function AccountMenu({
  user,
  company,
  companies,
}: {
  user: { name: string | null; email: string };
  company: { id: string; name: string };
  companies: { id: string; name: string }[];
}) {
  const path = usePathname();
  // The page the menu was opened on: it closes by itself on a new page.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpenOn(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenOn(null);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const row = "flex min-h-11 w-full items-center px-4 text-left hover:bg-text/[0.05]";
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="account-menu"
        aria-label={`${user.name ?? user.email}, ${company.name}: account`}
        title={user.name ?? user.email}
        onClick={() => setOpenOn(open ? null : path)}
        className="grid size-11 place-items-center rounded-full"
      >
        <span
          aria-hidden="true"
          className={cx(
            "grid size-8 place-items-center rounded-full bg-fill text-[0.8125rem] font-semibold text-text",
            open && "ring-2 ring-link",
          )}
        >
          {initials(user.name, user.email)}
        </span>
      </button>
      {open ? (
        <div
          id="account-menu"
          className="absolute top-full right-0 z-40 mt-1 w-72 overflow-hidden rounded-xl bg-surface py-1 text-[0.9375rem] text-text shadow-lg ring-1 ring-black/10"
        >
          <div className="px-4 py-2">
            <p className="truncate font-semibold">{user.name ?? user.email}</p>
            {user.name ? <p className="truncate text-text-muted">{user.email}</p> : null}
            {companies.length > 1 ? null : (
              <p className="truncate text-text-muted">{company.name}</p>
            )}
          </div>
          {companies.length > 1 ? (
            <form action={switchCompany} className="flex items-center gap-2 px-4 pb-2">
              <label htmlFor="company-switch" className="sr-only">
                Company
              </label>
              <select
                id="company-switch"
                name="company"
                defaultValue={company.id}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-control-border bg-surface px-2"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="min-h-11 px-2 font-semibold text-link">
                Switch
              </button>
            </form>
          ) : null}
          <div className="border-t-[0.5px] border-separator" />
          <div className="flex min-h-11 items-center justify-between pr-2 pl-4">
            Appearance
            <ThemeToggle />
          </div>
          <Link href="/more" className={row}>
            Account and Help
          </Link>
          <div className="border-t-[0.5px] border-separator" />
          <form action={signOut}>
            <button type="submit" className={row}>
              Sign Out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
