"use client";

import Link from "next/link";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import {
  createLongPress,
  menuIndex,
  opensMenu,
  placeMenu,
  typeAhead,
  visibleEntries,
  type MenuAction,
  type MenuEntry,
} from "@/lib/row-menu";
import { SwipeButtons, SwipeRow, type SwipeAction } from "./swipe-row";
import { showBanner } from "./top-banner";
import { cx } from "./ui";

export type { MenuAction, MenuEntry, SwipeAction };

/*
 * Swipe actions and touch-and-hold menus on every list (owner, 2026-10-20; gestures.md
 * section 12). One row component for every list:
 * - touch: the row swipes to show its actions (swipe-row.tsx), and touch and hold opens its
 *   menu, without opening the row or selecting its text;
 * - mouse: right-click opens the menu, and a "⋯" button shows on hover;
 * - keyboard and screen readers: the same "⋯" button shows on focus (the menu key and
 *   Shift+F10 open it too). The menu is a real menu: arrow keys, Home and End, type-ahead,
 *   Escape, and focus back where it was.
 * Every action is also on the row's own page, so a gesture is never the only way.
 */

// ---------------------------------------------------------------------------
// The menu
// ---------------------------------------------------------------------------

/**
 * A row's menu, at a point on the screen, kept inside the window. Its title is the row's name.
 * `touch`: opened by a finger, so the page behind dims, as iOS's context menus do.
 */
export function ContextMenu({
  title,
  entries,
  at,
  touch = false,
  onClose,
}: {
  title: string;
  entries: readonly MenuEntry[];
  at: { x: number; y: number };
  touch?: boolean;
  /** `refocus`: put focus back where it was (not when a choice leaves the page). */
  onClose: (refocus: boolean) => void;
}) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const shown = visibleEntries(entries);
  const actions = shown.filter((e): e is MenuAction => e !== "separator");
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });

  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>("[role^=menuitem]") ?? [])];

  useLayoutEffect(() => {
    const el = menu.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPlace(
      placeMenu(
        at,
        { width: r.width, height: r.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [at]);
  // Once it's placed (and visible), its first item has focus, so arrow keys work at once.
  const placed = place != null;
  useLayoutEffect(() => {
    if (placed) items()[0]?.focus({ preventScroll: true });
  }, [placed]);

  useEffect(() => {
    const away = () => close.current(false);
    window.addEventListener("resize", away);
    window.addEventListener("blur", away);
    // Scrolling the page under it closes it (not scrolling a long menu itself).
    const scroll = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) away();
    };
    window.addEventListener("scroll", scroll, true);
    return () => {
      window.removeEventListener("resize", away);
      window.removeEventListener("blur", away);
      window.removeEventListener("scroll", scroll, true);
    };
  }, []);

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const list = items();
    const current = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close.current(true);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      close.current(true);
      return;
    }
    if (e.key === " " && current >= 0) {
      // Space chooses, as Enter does (links don't on their own).
      e.preventDefault();
      list[current]!.click();
      return;
    }
    const next = menuIndex(e.key, current, list.length);
    if (next != null) {
      e.preventDefault();
      list[next]?.focus();
      return;
    }
    if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const at = typeAhead(
        actions.map((a) => a.label),
        e.key,
        current,
      );
      if (at >= 0) list[at]?.focus();
    }
  }

  function choose(a: MenuAction) {
    // Links act after the click (they need to be on the page); everything else closes first.
    if (a.href) setTimeout(() => close.current(false), 0);
    else {
      close.current(true);
      a.onSelect?.();
    }
  }

  const item = cx(
    "flex min-h-11 w-full items-center gap-2 px-4 text-left text-[1.0625rem] leading-snug outline-none",
    "hover:bg-text/[0.06] focus-visible:bg-text/[0.08] active:bg-text/[0.1]",
    "[@media(pointer:fine)]:min-h-9 [@media(pointer:fine)]:text-[0.9375rem]",
  );

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close.current(true);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (e.target === e.currentTarget) close.current(true);
      }}
    >
      {touch ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-black/20 motion-safe:animate-[fade-in_0.2s_ease-out]"
        />
      ) : null}
      <div
        ref={menu}
        id={id}
        role="menu"
        aria-label={title}
        onKeyDown={onKeyDown}
        data-testid="row-menu"
        style={
          {
            left: place?.left ?? at.x,
            top: place?.top ?? at.y,
            visibility: place ? undefined : "hidden",
          } as CSSProperties
        }
        className={cx(
          "glass-sheet fixed max-h-[calc(100dvh-1rem)] w-64 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-[0.875rem] py-1 shadow-xl",
          "motion-safe:animate-[fade-in_0.12s_ease-out]",
          "[@media(pointer:fine)]:w-60",
        )}
      >
        {/* The row's name, so the menu says what it acts on (gestures.md section 12). */}
        <div
          aria-hidden="true"
          className="truncate border-b-[0.5px] border-separator px-4 pt-1.5 pb-2 text-[0.8125rem] font-semibold text-text-muted"
        >
          {title}
        </div>
        {shown.map((e, i) => {
          if (e === "separator")
            return (
              <div
                key={`sep-${i}`}
                role="separator"
                className="my-1 border-t-[0.5px] border-separator"
              />
            );
          const role = e.checked != null ? "menuitemradio" : "menuitem";
          const className = cx(item, e.destructive ? "text-status-fail" : "text-text");
          const body = (
            <>
              {e.checked != null ? (
                <span aria-hidden="true" className="w-4 shrink-0 font-semibold text-link">
                  {e.checked ? "✓" : ""}
                </span>
              ) : null}
              <span className="min-w-0 flex-1">{e.label}</span>
            </>
          );
          const common = {
            role,
            tabIndex: -1,
            "aria-checked": e.checked != null ? e.checked : undefined,
            className,
          } as const;
          if (e.href && e.external)
            return (
              <a
                key={e.label}
                {...common}
                href={e.href}
                {...(/^https?:/.test(e.href)
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                onClick={() => choose(e)}
              >
                {body}
              </a>
            );
          if (e.href)
            return (
              <Link key={e.label} {...common} href={e.href} onClick={() => choose(e)}>
                {body}
              </Link>
            );
          return (
            <button key={e.label} type="button" {...common} onClick={() => choose(e)}>
              {body}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// A row with swipe actions and a menu
// ---------------------------------------------------------------------------

export interface RowActionsHandle {
  /** Opens the row's menu at a point (by the row when none is given). */
  open: (at?: { x: number; y: number }, touch?: boolean) => void;
}

interface RowMenuState {
  title: string;
  expanded: boolean;
  /** Opens the menu below an element (the "⋯" button). */
  openFrom: (el: HTMLElement) => void;
  hasMenu: boolean;
}

const RowMenu = createContext<RowMenuState | null>(null);

/** The "⋯" button's look: a round button that shows on hover and keyboard focus. */
const MORE_BUTTON = cx(
  "grid size-8 place-items-center rounded-full bg-surface text-link shadow-[0_1px_4px_rgb(0_0_0/0.15)]",
  "pointer-events-none opacity-0 transition-opacity motion-reduce:transition-none",
  "group-hover/row:pointer-events-auto group-hover/row:opacity-100",
  "group-has-[:focus-visible]/row:pointer-events-auto group-has-[:focus-visible]/row:opacity-100",
  "focus-visible:pointer-events-auto focus-visible:opacity-100",
  "aria-expanded:pointer-events-auto aria-expanded:opacity-100",
);

/**
 * The row's "⋯" button, for rows that place it themselves (a table's last cell, which keeps
 * room for it so nothing it covers is cut off). RowActions places it by itself otherwise.
 */
export function RowMenuButton({
  className,
  visible = false,
}: {
  className?: string;
  /** Always shown (a card's own More button), not only on hover and focus. */
  visible?: boolean;
}) {
  const m = use(RowMenu);
  if (!m?.hasMenu && !visible) return null;
  return (
    <button
      type="button"
      aria-label={`More: ${m?.title ?? ""}`}
      aria-haspopup="menu"
      aria-expanded={m?.expanded ?? false}
      onClick={(e) => m?.openFrom(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          m?.openFrom(e.currentTarget);
        }
      }}
      // Not part of a swipe or a hold on the row.
      data-no-row-swipe=""
      disabled={!m?.hasMenu}
      className={
        visible
          ? className
          : cx(MORE_BUTTON, className ?? "absolute top-1/2 right-1 -translate-y-1/2")
      }
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
        <circle cx="6" cy="12" r="1.8" />
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="18" cy="12" r="1.8" />
      </svg>
    </button>
  );
}

/**
 * Touches that are the control's own: a drag grip, a player, a field, the "⋯" button, and a
 * segmented control's chosen segment (it drags).
 */
const NO_HOLD =
  "[data-grip], [data-no-row-swipe], video, audio, input, textarea, select, [role=radio][aria-checked=true]";

/**
 * A list row with its swipe actions and its menu (see the top of this file). `as` is the row's
 * element (an `li` in a grouped list, a `tr` in a table, a `div` in a card); a table row has
 * no swipes and puts RowMenuButton in a cell. Without `menu`, it's only a swipe row.
 */
export function RowActions({
  as = "div",
  title,
  menu,
  leading,
  trailing,
  button = "overlay",
  buttonClassName,
  longPress = true,
  disabled = false,
  className,
  swipeClassName,
  handle,
  children,
  ...rest
}: {
  as?: "div" | "li" | "tr" | "article";
  /** The menu's title: the row's name (the customer, plus the job or invoice number). */
  title: string;
  menu?: readonly MenuEntry[];
  /** Swipe right to show (Mark Complete). Touch only. */
  leading?: SwipeAction[];
  /** Swipe left to show (Call, Directions). Touch only. */
  trailing?: SwipeAction[];
  /** "overlay": the "⋯" button sits over the row's end; "none": the row places RowMenuButton. */
  button?: "overlay" | "none";
  /** Where the overlay button sits, when not over the row's end. */
  buttonClassName?: string;
  /** false: touch and hold is the row's own (it drags on a hold). */
  longPress?: boolean;
  /** Saving: no new swipes, and the menu waits. */
  disabled?: boolean;
  className?: string;
  /** The look of the part that moves (a card's corners and fill). */
  swipeClassName?: string;
  handle?: Ref<RowActionsHandle>;
  children: ReactNode;
  "data-testid"?: string;
  /** Not a page swipe (a row on a page that swipes between sections). */
  "data-no-swipe"?: string;
  "aria-label"?: string;
  style?: CSSProperties;
}) {
  const Tag = as;
  const root = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<{ at: { x: number; y: number }; touch: boolean } | null>(null);
  const before = useRef<HTMLElement | null>(null);
  const swallow = useRef(false);
  const hasMenu = !!menu && visibleEntries(menu).length > 0;

  const show = useCallback(
    (at?: { x: number; y: number }, touch = false) => {
      if (!hasMenu || disabled) return;
      before.current = document.activeElement as HTMLElement | null;
      let point = at;
      if (!point) {
        const r = root.current?.getBoundingClientRect();
        point = r ? { x: r.left + 24, y: r.bottom - 8 } : { x: 16, y: 16 };
      }
      setOpen((o) => o ?? { at: point, touch });
    },
    [hasMenu, disabled],
  );
  useImperativeHandle(handle, () => ({ open: show }), [show]);

  const showRef = useRef(show);
  useLayoutEffect(() => {
    showRef.current = show;
  });
  // Touch and hold, made on first touch (event handlers only).
  const pressRef = useRef<ReturnType<typeof createLongPress> | null>(null);
  const press = () =>
    (pressRef.current ??= createLongPress({
      onPress: (at) => {
        swallow.current = true;
        navigator.vibrate?.(10);
        // The press's own text selection, if any started.
        window.getSelection?.()?.removeAllRanges();
        showRef.current(at, true);
      },
    }));
  useEffect(() => () => pressRef.current?.cancel(), []);

  const close = useCallback((refocus: boolean) => {
    setOpen(null);
    const el = before.current;
    before.current = null;
    if (refocus && el && el !== document.body && el.isConnected) el.focus({ preventScroll: true });
  }, []);

  // React passes events up from portals (a sheet, a photo viewer): only the row's own count.
  const mine = (e: { target: EventTarget }) => !!root.current?.contains(e.target as Node);
  const events = hasMenu
    ? {
        onContextMenu: (e: ReactMouseEvent) => {
          if (!mine(e)) return;
          // Inside a field the browser's own menu (paste) stays.
          if ((e.target as Element).closest("input, textarea, select")) return;
          e.preventDefault();
          // A hold on Android also sends this: the hold already opened the menu.
          if (open) return;
          const { clientX: x, clientY: y } = e;
          // The keyboard's menu key gives no point: open it by the row.
          if (x === 0 && y === 0) {
            show();
            return;
          }
          const held = !!pressRef.current?.waiting;
          show({ x, y }, held);
          if (held) {
            press().cancel();
            swallow.current = true;
          }
        },
        onPointerDown: (e: ReactPointerEvent) => {
          swallow.current = false;
          if (!mine(e) || !longPress || e.pointerType === "mouse" || !e.isPrimary) return;
          if ((e.target as Element).closest(NO_HOLD)) return;
          press().down(e.clientX, e.clientY);
        },
        onPointerMove: (e: ReactPointerEvent) => pressRef.current?.move(e.clientX, e.clientY),
        onPointerUp: () => {
          if (pressRef.current?.up()) swallow.current = true;
        },
        onPointerCancel: () => pressRef.current?.cancel(),
        // The tap that ends a hold doesn't also open the row.
        onClickCapture: (e: ReactMouseEvent) => {
          if (!swallow.current) return;
          swallow.current = false;
          e.preventDefault();
          e.stopPropagation();
        },
        onKeyDown: (e: ReactKeyboardEvent) => {
          if (!mine(e) || !opensMenu(e)) return;
          e.preventDefault();
          const r = (e.target as HTMLElement).getBoundingClientRect();
          show({ x: r.left + 16, y: r.bottom });
        },
      }
    : {};

  const openFrom = useCallback(
    (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      before.current = el;
      if (!hasMenu || disabled) return;
      // Below the button, its right edge lined up with the button's (as a pull-down menu).
      setOpen({ at: { x: Math.max(8, r.right - 240), y: r.bottom + 6 }, touch: false });
    },
    [hasMenu, disabled],
  );

  // Kept mounted while saving (paused), so the row and its focus stay put.
  // An empty side still keeps the swipe row, so the row isn't remade when its actions change.
  const swipes = as !== "tr" && (leading !== undefined || trailing !== undefined);
  const overlay =
    button === "overlay" ? (
      <RowMenuButton className={buttonClassName ?? "absolute top-1/2 right-1 -translate-y-1/2"} />
    ) : null;
  const body = swipes ? (
    <SwipeRow
      leading={leading?.length ? <SwipeButtons actions={leading} /> : undefined}
      trailing={trailing?.length ? <SwipeButtons actions={trailing} /> : undefined}
      paused={!!open || disabled}
      className={swipeClassName}
    >
      {children}
      {overlay}
    </SwipeRow>
  ) : (
    <>
      {children}
      {overlay}
    </>
  );

  return (
    <RowMenu value={{ title, expanded: !!open, openFrom, hasMenu }}>
      <Tag
        // The tag varies; its ref is the row's element.
        ref={root as never}
        {...rest}
        {...events}
        className={cx(
          "group/row",
          as !== "tr" && "relative",
          // A hold opens the menu: no callout or text selection on touch screens.
          hasMenu &&
            longPress &&
            "[-webkit-touch-callout:none] [@media(pointer:coarse)]:select-none",
          className,
        )}
      >
        {body}
      </Tag>
      {open && menu ? (
        <ContextMenu title={title} entries={menu} at={open.at} touch={open.touch} onClose={close} />
      ) : null}
    </RowMenu>
  );
}

// ---------------------------------------------------------------------------
// What actions do
// ---------------------------------------------------------------------------

/** Copy text for the customer (a link, a job number) and say so at the top of the screen. */
export function copyWithBanner(text: string, message: string) {
  void (async () => {
    try {
      await navigator.clipboard.writeText(text);
      showBanner({ message });
    } catch {
      showBanner({ tone: "error", message: "Couldn’t copy. Try again." });
    }
  })();
}

/** A server action's usual answer. */
export interface ActionResult {
  error?: string;
  message?: string;
  fields?: Record<string, string>;
}

/** The result of an action from a row, in the top banner (with Undo where the page has it). */
export function bannerFor(
  r: ActionResult,
  fallback: string,
  action?: { label: string; onAction: () => void },
) {
  const error = r.error ?? Object.values(r.fields ?? {})[0];
  if (error) showBanner({ tone: "error", message: error });
  else
    showBanner({ message: r.message && r.message !== "Updated." ? r.message : fallback, action });
}

/** FormData from plain fields, for the server actions the row's page calls from its forms. */
export function formOf(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}
