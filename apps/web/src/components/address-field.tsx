"use client";

import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import type { AddressSuggestion } from "@leakbook/core";
import { suggestAddress } from "@/app/actions/address";
import { SField } from "./settings-forms";
import { cx } from "./ui";

/**
 * A street address field that suggests real addresses as it's typed (owner, 2026-10-20: "an
 * auto complete or something for the mapping because it's just too big of an issue if a address
 * doesn't register"). Picking one fills the street, and the city, state and ZIP fields of the
 * same form (by name), so the address the map knows is the one saved. Typing your own still
 * works. A combobox: arrows move through the list, Enter picks, Escape closes it.
 */
export function AddressField({
  fields = { city: "city", state: "state", postal_code: "postal_code" },
  ...props
}: Omit<ComponentProps<typeof SField>, "onChange"> & {
  /** The names of the form's other address fields. */
  fields?: { city: string; state: string; postal_code: string };
}) {
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const typed = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const input = () => wrap.current?.querySelector("input") ?? null;

  function lookUp(text: string) {
    typed.current = text;
    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length < 4) {
      setItems([]);
      setOpen(false);
      return;
    }
    // A short pause after typing, so each word isn't a lookup.
    timer.current = setTimeout(async () => {
      const found = await suggestAddress(text).catch(() => []);
      if (typed.current !== text) return;
      setItems(found);
      setActive(-1);
      setOpen(found.length > 0);
    }, 300);
  }

  function pick(s: AddressSuggestion) {
    const el = input();
    const form = el?.form;
    if (el) el.value = s.line1;
    const set = (name: string, value: string) => {
      const f = form?.elements.namedItem(name);
      if (f instanceof HTMLInputElement || f instanceof HTMLSelectElement) f.value = value;
    };
    set(fields.city, s.city);
    set(fields.state, s.state);
    set(fields.postal_code, s.postal_code);
    setOpen(false);
    setItems([]);
    el?.focus();
  }

  return (
    <div
      ref={wrap}
      className={cx("relative", props.className)}
      onBlur={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <SField
        {...props}
        className={undefined}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => lookUp(e.target.value)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(items[active]!);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggested addresses"
          // A pop-over on wider screens; on phones, rows under the field (a grouped card clips
          // anything that floats out of it).
          className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-2xl bg-surface shadow-lg ring-1 ring-separator max-sm:static max-sm:mt-0 max-sm:rounded-none max-sm:shadow-none max-sm:ring-0"
        >
          {items.map((s, i) => (
            <li
              key={`${s.label}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              // Picked on press, before the field's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              className={cx(
                "flex min-h-11 cursor-pointer flex-col justify-center border-b-[0.5px] border-separator px-4 py-2 last:border-b-0",
                i === active ? "bg-link/10" : "hover:bg-text/[0.04]",
              )}
            >
              <span className="font-medium">{s.line1}</span>
              <span className="text-[0.9375rem] text-text-muted">
                {[s.city, [s.state, s.postal_code].filter(Boolean).join(" ")]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
