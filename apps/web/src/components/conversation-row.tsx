"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { setUnread } from "@/app/actions/texting";
import { cx } from "./ui";
import { NO_CONNECTION, whenOffline } from "@/lib/offline";

const ACTION_WIDTH = 88;
/** A swipe past this share of the row acts on release (a "full swipe", as in Messages). */
const FULL_SWIPE = 0.55;

/**
 * One conversation in the inbox. Unread is shared by the whole team (owner, 2026-10-16), and
 * every way of using the list can change it:
 * - touch: as in iOS Messages, a swipe right shows a blue Unread (or Read) button, and a full
 *   swipe acts on release;
 * - mouse: a Mark as Unread (or Read) button on hover, and a right-click menu, as in Mail on
 *   the Mac;
 * - keyboard and VoiceOver: that button shows when it has focus.
 */
export function InboxRow({
  id,
  name,
  when,
  preview,
  unread,
  current,
}: {
  id: string;
  name: string;
  when: string;
  preview: string;
  unread: boolean;
  current: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dx, setDx] = useState<number | null>(null);
  const [pending, start] = useTransition();
  // Shown at once, until the server's value changes (this change, or a teammate's).
  const [shown, setShown] = useState<{ value: boolean; was: boolean } | null>(null);
  const isUnread = shown && shown.was === unread ? shown.value : unread;
  const live = useRef(0);
  const width = useRef(0);
  const drag = useRef<{ x0: number; y0: number; base: number; axis: "x" | "y" | null } | null>(
    null,
  );
  // A swipe ends with a click on the row; that click must not open the conversation.
  const swallow = useRef(false);
  const offset = dx ?? (open ? ACTION_WIDTH : 0);
  // The right-click menu, where it was opened.
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "pointerdown" && menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);
  const markLabel = isUnread ? "Mark as Read" : "Mark as Unread";

  function toggle() {
    setOpen(false);
    setMenu(null);
    const next = !isUnread;
    setShown({ value: next, was: unread });
    start(async () => {
      const r = await whenOffline(setUnread(id, next), { error: NO_CONNECTION });
      if (r.error) setShown(null);
      router.refresh();
    });
  }
  function down(e: PointerEvent<HTMLDivElement>) {
    swallow.current = false;
    if (e.pointerType === "mouse" || pending) return;
    width.current = e.currentTarget.offsetWidth;
    drag.current = { x0: e.clientX, y0: e.clientY, base: open ? ACTION_WIDTH : 0, axis: null };
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x0;
    const my = e.clientY - d.y0;
    if (d.axis === null) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      d.axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      if (d.axis === "x") e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (d.axis !== "x") return;
    live.current = Math.max(0, Math.min(width.current * 0.8, d.base + mx));
    setDx(live.current);
  }
  function up() {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== "x") return;
    swallow.current = true;
    setDx(null);
    if (live.current > width.current * FULL_SWIPE) toggle();
    else setOpen(live.current > ACTION_WIDTH / 2);
  }

  function contextMenu(e: MouseEvent) {
    e.preventDefault();
    // The keyboard's menu key (or Shift+F10) gives no pointer position: open it by the row.
    let { clientX: x, clientY: y } = e;
    if (x === 0 && y === 0) {
      const r = e.currentTarget.getBoundingClientRect();
      x = r.left + 24;
      y = r.bottom - 8;
    }
    // Kept inside the window.
    setMenu({ x: Math.min(x, window.innerWidth - 220), y: Math.min(y, window.innerHeight - 110) });
  }
  /** Up and down move between the menu's items, as in any menu (menus.md). */
  function menuKeys(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]")];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <li className="group relative overflow-hidden">
      {offset > 0 ? (
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          aria-hidden={!open}
          onClick={toggle}
          style={{ width: Math.max(ACTION_WIDTH, offset) }}
          className="absolute inset-y-0 left-0 flex items-center justify-start bg-link pl-5 text-[1.0625rem] font-semibold text-on-primary"
        >
          {isUnread ? "Read" : "Unread"}
        </button>
      ) : null}
      <div
        style={offset ? { transform: `translateX(${offset}px)` } : undefined}
        className={cx("relative touch-pan-y bg-surface", dx === null && "transition-transform")}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          drag.current = null;
          setDx(null);
        }}
        onContextMenu={contextMenu}
        onClickCapture={(e) => {
          if (swallow.current || open) {
            swallow.current = false;
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
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
            <span className="block truncate text-[0.9375rem] text-text-muted">
              {preview || " "}
            </span>
          </span>
        </Link>
        {/* Mouse and keyboard: shown on hover or focus, over the date. Touch swipes instead. */}
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-label={`${markLabel}: ${name}`}
          className="absolute top-2 right-3 min-h-9 rounded-full bg-surface px-3 text-[0.8125rem] font-semibold text-link opacity-0 shadow-[0_1px_4px_rgb(0_0_0/0.15)] group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:hidden"
        >
          {isUnread ? "Read" : "Unread"}
        </button>
      </div>
      {menu ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={name}
          onKeyDown={menuKeys}
          style={{ left: menu.x, top: menu.y }}
          className="glass-sheet fixed z-50 w-52 overflow-hidden rounded-xl py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={toggle}
            className="block min-h-10 w-full px-4 text-left hover:bg-link hover:text-on-primary focus-visible:bg-link focus-visible:text-on-primary focus-visible:outline-none"
          >
            {markLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null);
              router.push(`/messages/${id}`);
            }}
            className="block min-h-10 w-full px-4 text-left hover:bg-link hover:text-on-primary focus-visible:bg-link focus-visible:text-on-primary focus-visible:outline-none"
          >
            Open Conversation
          </button>
        </div>
      ) : null}
    </li>
  );
}
