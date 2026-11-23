"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import {
  CONTACT_SWITCH_FOOTER,
  CONTACT_SWITCH_LABEL,
  ROLE_LABELS,
  TECH_COLORS,
  techColor,
  type Role,
} from "@leakbook/core";
import {
  setMemberColor,
  setMemberContact,
  setMemberRole,
  updateMember,
} from "@/app/actions/settings";
import { ContextMenu, bannerFor, formOf } from "./row-actions";
import { useConfirm } from "./sheet";
import { techCss } from "./tech-dot";
import { cx } from "./ui";

// Settings › Team's controls (owner, 2026-10-20, docs/design/2026-10-20-team-week.md section 2):
// the On/Off switch at a row's end and in the profile, and the Color picker in the profile.

/**
 * On/Off for a teammate: turning someone off asks first; turning them on doesn't. Saves through
 * the same action as the profile's Role (updateMember), keeping their role.
 */
export function MemberSwitch({
  id,
  name,
  role,
  active,
  disabled = false,
  row = false,
}: {
  /** The membership. */
  id: string;
  name: string;
  role: Role;
  active: boolean;
  /** Yourself, or an owner when you're an admin. */
  disabled?: boolean;
  /** In the profile: a full row with its label. */
  row?: boolean;
}) {
  const [on, setOn] = useOptimistic(active);
  const [pending, start] = useTransition();
  const [confirm, confirmSheet] = useConfirm();
  async function change(next: boolean) {
    if (
      !next &&
      !(await confirm({
        title: `Turn off ${name}? They can’t sign in, and their coming jobs stay as they are.`,
        confirmLabel: "Turn Off",
        destructive: true,
      }))
    )
      return;
    start(async () => {
      setOn(next);
      const r = await updateMember({}, formOf({ id, role, status: next ? "active" : "disabled" }));
      // Say what changed, not the form's "Saved.".
      bannerFor({ ...r, message: undefined }, next ? `${name} is on.` : `${name} is turned off.`);
      if (r.error) setOn(!next);
    });
  }
  const input = (
    <input
      type="checkbox"
      role="switch"
      className="ios-switch"
      aria-label={row ? undefined : `${name} on`}
      checked={on}
      disabled={disabled || pending}
      onChange={(e) => void change(e.target.checked)}
      data-testid="member-switch"
    />
  );
  return (
    <>
      {row ? (
        <label
          className={cx(
            "flex min-h-11 items-center justify-between gap-3 px-4 py-2",
            disabled ? "cursor-default" : "cursor-pointer",
          )}
        >
          <span className="min-w-0">
            <span className="block">On</span>
            <span className="block text-[0.9375rem] text-text-muted">
              {disabled
                ? "You can’t turn yourself off."
                : on
                  ? "Can sign in and be given jobs."
                  : "Turned off: can’t sign in."}
            </span>
          </span>
          {input}
        </label>
      ) : (
        input
      )}
      {confirmSheet}
    </>
  );
}

/**
 * The tech's color: the ten palette colors as round swatches with their names, picked like a
 * radio group; it saves at once. The name is spoken, never the color alone.
 */
export function ColorPicker({ id, name, color }: { id: string; name: string; color: string }) {
  const [shown, setShown] = useOptimistic(techColor(color));
  const [, start] = useTransition();
  function pick(key: string) {
    if (key === shown) return;
    start(async () => {
      setShown(techColor(key));
      const r = await setMemberColor({ id, color: key });
      bannerFor(r, "Color changed.");
    });
  }
  return (
    <div>
      <p aria-hidden="true" className="mb-1.5 px-4 text-[0.9375rem] text-text-muted sm:px-0">
        Color
      </p>
      <div
        role="radiogroup"
        aria-label={`${name}’s color`}
        className="grouped grid grid-cols-5 gap-y-1 p-2"
        onKeyDown={(e) => {
          const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
          if (!step) return;
          e.preventDefault();
          const i = TECH_COLORS.findIndex((c) => c.key === shown);
          const next = TECH_COLORS[(i + step + TECH_COLORS.length) % TECH_COLORS.length]!;
          pick(next.key);
          e.currentTarget
            .querySelectorAll<HTMLButtonElement>("[role=radio]")
            [TECH_COLORS.indexOf(next)]?.focus();
        }}
      >
        {TECH_COLORS.map((c) => {
          const on = c.key === shown;
          return (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => pick(c.key)}
              className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl py-1.5 hover:bg-text/[0.04]"
            >
              <span
                aria-hidden="true"
                className={cx(
                  "grid size-8 place-items-center rounded-full",
                  on && "ring-2 ring-text ring-offset-2 ring-offset-surface",
                )}
                style={{ backgroundColor: techCss(c.key) }}
              >
                {on ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="size-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : null}
              </span>
              <span className="text-[0.8125rem]">{c.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const ROLES: Role[] = ["owner", "admin", "tech"];

/**
 * The role under a name on the Team list, for owners (owner, 2026-11-23: "this screen is where
 * the owner can set what role each user is"): an iOS pop-up button, the role in link blue with
 * the up-and-down chevron, opening a menu of Owner, Admin and Tech with a check on the current
 * one. It saves at once; making someone an owner asks first. `note` follows it ("No customer
 * contact").
 */
export function RolePopUp({
  id,
  name,
  role,
  note,
}: {
  /** The membership. */
  id: string;
  name: string;
  role: Role;
  note?: string;
}) {
  const [shown, setShown] = useOptimistic(role);
  const [, start] = useTransition();
  const [confirm, confirmSheet] = useConfirm();
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  async function pick(next: Role) {
    if (next === shown) return;
    if (
      next === "owner" &&
      !(await confirm({
        title: `Make ${name} an owner? Owners can change billing, payments, and everyone’s role.`,
        confirmLabel: "Make Owner",
      }))
    )
      return;
    start(async () => {
      setShown(next);
      const r = await setMemberRole({ id, role: next });
      const article = next === "tech" ? "a" : "an";
      bannerFor(r, `${name} is now ${article} ${ROLE_LABELS[next].toLowerCase()}.`);
    });
  }
  return (
    <span className="flex flex-wrap items-center gap-x-1 text-[0.9375rem]">
      <button
        ref={button}
        type="button"
        aria-label={`Role, ${ROLE_LABELS[shown]}`}
        aria-haspopup="menu"
        aria-expanded={at != null}
        data-testid="role-popup"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ x: r.left, y: r.bottom + 4 });
        }}
        className="-my-1.5 inline-flex min-h-11 items-center gap-1 rounded-lg pr-1 text-link focus-visible:outline-3 focus-visible:outline-focus"
      >
        {ROLE_LABELS[shown]}
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 9.5l5-5 5 5M7 14.5l5 5 5-5" />
        </svg>
      </button>
      {note ? <span className="text-text-muted">· {note}</span> : null}
      {at ? (
        <ContextMenu
          title={`${name}’s role`}
          entries={ROLES.map((r) => ({
            label: ROLE_LABELS[r],
            checked: r === shown,
            onSelect: () => void pick(r),
          }))}
          at={at}
          onClose={(refocus) => {
            setAt(null);
            if (refocus) button.current?.focus();
          }}
        />
      ) : null}
      {confirmSheet}
    </span>
  );
}

/**
 * Text and Call Customers on a tech's profile (owner, 2026-11-23; core contact.ts): a switch
 * row with what it covers under it. Saves at once.
 */
export function ContactSwitch({ id, name, on }: { id: string; name: string; on: boolean }) {
  const [shown, setShown] = useOptimistic(on);
  const [pending, start] = useTransition();
  function change(next: boolean) {
    start(async () => {
      setShown(next);
      const r = await setMemberContact({ id, on: next });
      bannerFor(
        r,
        next ? `${name} can text and call customers.` : `${name} can’t text or call customers.`,
      );
    });
  }
  return (
    <div>
      <ul className="grouped">
        <li>
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-2">
            <span className="min-w-0">{CONTACT_SWITCH_LABEL}</span>
            <input
              type="checkbox"
              role="switch"
              className="ios-switch"
              checked={shown}
              disabled={pending}
              onChange={(e) => change(e.target.checked)}
              data-testid="contact-switch"
            />
          </label>
        </li>
      </ul>
      <p className="mt-1.5 px-4 text-[0.8125rem] text-text-muted">{CONTACT_SWITCH_FOOTER}</p>
    </div>
  );
}
