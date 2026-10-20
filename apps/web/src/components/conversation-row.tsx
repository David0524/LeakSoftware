"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { callCustomer, setUnread } from "@/app/actions/texting";
import { PhoneIcon } from "./icons";
import { RowActions, bannerFor, type MenuEntry, type SwipeAction } from "./row-actions";
import { cx } from "./ui";

/**
 * One conversation in the inbox. Unread is shared by the whole team (owner, 2026-10-16), and
 * every way of using the list can change it (gestures.md section 12):
 * - touch: swipe left for Read (or Unread), swipe right for Call, touch and hold for the menu;
 * - mouse: right-click, or the "⋯" button on hover, for the menu, as in Mail on the Mac;
 * - keyboard and VoiceOver: the "⋯" button shows when it has focus.
 * The conversation itself has Mark as Unread and Call too.
 */
export function InboxRow({
  id,
  name,
  when,
  preview,
  unread,
  current,
  customerId = null,
  canCall = false,
}: {
  id: string;
  name: string;
  when: string;
  preview: string;
  unread: boolean;
  current: boolean;
  customerId?: string | null;
  canCall?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Shown at once, until the server's value changes (this change, or a teammate's).
  const [shown, setShown] = useState<{ value: boolean; was: boolean } | null>(null);
  const isUnread = shown && shown.was === unread ? shown.value : unread;

  function toggle() {
    const next = !isUnread;
    setShown({ value: next, was: unread });
    start(async () => {
      const r = await setUnread(id, next);
      if (r.error) {
        setShown(null);
        bannerFor(r, "");
      }
      router.refresh();
    });
  }
  function call() {
    start(async () => bannerFor(await callCustomer(id), "Calling you. Answer to connect."));
  }

  const read: SwipeAction = {
    label: isUnread ? "Read" : "Unread",
    tone: "blue",
    onSelect: toggle,
  };
  const callAction: SwipeAction | null = canCall
    ? { label: "Call", tone: "green", icon: <PhoneIcon />, onSelect: call }
    : null;
  const menu: MenuEntry[] = [
    { label: "Open", href: `/messages/${id}` },
    callAction && { label: "Call", onSelect: call },
    { label: isUnread ? "Mark Read" : "Mark Unread", onSelect: toggle },
    customerId && { label: "Open Customer", href: `/customers/${customerId}` },
  ];

  return (
    <RowActions
      as="li"
      title={name}
      menu={menu}
      leading={callAction ? [callAction] : []}
      trailing={[read]}
      disabled={pending}
      // Over the date, as the old Read button was: the name keeps its room.
      buttonClassName="absolute top-1.5 right-2"
    >
      <Link
        href={`/messages/${id}`}
        aria-current={current ? "page" : undefined}
        className={cx(
          "flex min-h-11 items-start gap-3 px-4 py-2.5 hover:bg-text/[0.03] active:bg-text/[0.06]",
          current && "bg-link/10 hover:bg-link/10",
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            "mt-2 size-2.5 shrink-0 rounded-full",
            isUnread ? "bg-link" : "bg-transparent",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cx("min-w-0 flex-1 truncate", isUnread && "font-semibold")}>
              {name}
              {isUnread ? <span className="sr-only">, unread</span> : null}
            </span>
            <span className="shrink-0 text-[0.9375rem] text-text-muted">{when}</span>
          </span>
          <span className="block truncate text-[0.9375rem] text-text-muted">{preview || " "}</span>
        </span>
      </Link>
    </RowActions>
  );
}
