"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  CHARGE_CHEMICALS_TEXT,
  OTHER_CATEGORY,
  PRICE_BOOK_TEXT,
  priceBookCategoryStart,
} from "@leakbook/core";
import { ChargeChemicalsSwitch } from "./charge-chemicals";
import { SField, SSelect } from "./settings-forms";
import { cx } from "./ui";

/**
 * Settings › Price Book › Chemicals, first on the page (owner, 2026-10-25: "move chemicals to
 * the top and as a dropdown, minimized if charge for chemicals is turned off"). The header is a
 * disclosure button with the item count, as a sidebar group's title (side-section.tsx): open
 * when the shop charges for chemicals, collapsed when it doesn't, and either way it opens and
 * closes when tapped. The Charge for Chemicals switch stays in view; flipping it opens or
 * collapses the items to match.
 */
export function PriceBookChemicals({
  charges,
  showSwitch,
  count,
  children,
}: {
  charges: boolean;
  /** Pool shops: Charge for Chemicals sits with the prices it uses (owner, 2026-10-24). */
  showSwitch: boolean;
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(charges);
  const [on, setOn] = useState(charges);
  const id = useId();
  return (
    <section data-testid="price-chemicals">
      <h2 className="mb-1 font-sans text-[0.8125rem] font-normal tracking-normal text-text-muted uppercase">
        <button
          type="button"
          aria-label={`Chemicals, ${count}`}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex min-h-11 w-full items-center gap-1.5 -mx-1 rounded-lg px-1 text-left uppercase focus-visible:outline-3 focus-visible:outline-focus"
        >
          <span className="min-w-0 truncate">Chemicals</span>
          <span className="tabular-nums">{count}</span>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={cx(
              "ml-auto size-3.5 shrink-0 transition-transform motion-reduce:transition-none",
              open && "rotate-90",
            )}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </h2>
      {showSwitch || open ? (
        <ul className="grouped" id={id}>
          {showSwitch ? (
            <li>
              <ChargeChemicalsSwitch
                initial={charges}
                onChange={(next) => {
                  setOn(next);
                  setOpen(next);
                }}
              />
            </li>
          ) : null}
          {open ? children : null}
        </ul>
      ) : (
        <div id={id} hidden />
      )}
      {showSwitch ? (
        <p className="mt-2 px-4 text-[0.8125rem] text-text-muted">
          {on ? CHARGE_CHEMICALS_TEXT.on : CHARGE_CHEMICALS_TEXT.off}
        </p>
      ) : null}
    </section>
  );
}

/**
 * A price book item's category (owner, 2026-10-25): a choice of the shop's categories and
 * Other, which shows a field to write a new one in; left blank, the item is filed under Other.
 * Posts `category_choice` and `category_custom` (priceBookCategory on the server).
 */
export function PriceCategoryField({
  idPrefix,
  category,
  choices,
}: {
  idPrefix: string;
  category: string | null | undefined;
  choices: string[];
}) {
  const start = priceBookCategoryStart(category, choices);
  const [choice, setChoice] = useState(start.choice);
  const select = useRef<HTMLSelectElement>(null);
  // A form cleared after a save starts the choice over too.
  useEffect(() => {
    const form = select.current?.form;
    if (!form) return;
    const reset = () => setChoice(start.choice);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [start.choice]);
  return (
    <>
      <SSelect
        ref={select}
        label={PRICE_BOOK_TEXT.category}
        name="category_choice"
        id={`category-${idPrefix}`}
        defaultValue={start.choice}
        onChange={(e) => setChoice(e.target.value)}
        options={choices.map((c) => ({ value: c, label: c }))}
      />
      {choice === OTHER_CATEGORY ? (
        <SField
          label={PRICE_BOOK_TEXT.newCategory}
          name="category_custom"
          id={`category-custom-${idPrefix}`}
          defaultValue={start.custom}
          placeholder={PRICE_BOOK_TEXT.newCategoryPlaceholder}
          maxLength={60}
        />
      ) : null}
    </>
  );
}
