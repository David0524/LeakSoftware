/*
 * Swipe actions and touch-and-hold menus on every list (gestures.md section 12): the rules the
 * shared row menu follows, kept apart from React so they can be tested.
 */

/** How long a finger rests on a row before its menu opens (iOS's touch and hold). */
export const LONG_PRESS_MS = 500;
/** How far it may wander meanwhile; further is a scroll or a swipe, not a hold. */
export const LONG_PRESS_SLOP = 10;
/** The gap kept between a menu and the window's edges. */
export const MENU_MARGIN = 8;

/** One choice in a row's menu. */
export interface MenuAction {
  label: string;
  /** Runs on choosing it (a server action, a sheet). */
  onSelect?: () => void;
  /** Or goes here: a page in the site, or tel:, sms: and maps links (`external`). */
  href?: string;
  /** Opens outside the site: a new tab for web addresses (Maps). */
  external?: boolean;
  /** Red, and listed last (context-menus.md: destructive items at the end). */
  destructive?: boolean;
  /** The current choice of several (a checklist answer): a check beside it. */
  checked?: boolean;
}

/**
 * A menu as a page writes it: actions, separators between groups, and gaps for the actions a
 * row can't take (null or false), which aren't shown (context-menus.md: hide, don't dim).
 */
export type MenuEntry = MenuAction | "separator" | null | false | undefined | "" | 0;

/** What the menu shows: no gaps, and separators only between two groups. */
export function visibleEntries(entries: readonly MenuEntry[]): (MenuAction | "separator")[] {
  const out: (MenuAction | "separator")[] = [];
  for (const e of entries) {
    if (!e) continue;
    if (e === "separator") {
      if (out.length && out[out.length - 1] !== "separator") out.push(e);
      continue;
    }
    out.push(e);
  }
  while (out[out.length - 1] === "separator") out.pop();
  return out;
}

/**
 * Where the menu goes: below and to the right of the point it opened from, as on a Mac,
 * flipped left or up when it would run off the window, and never past its edges.
 */
export function placeMenu(
  at: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = MENU_MARGIN,
): { left: number; top: number } {
  const fit = (start: number, length: number, room: number, flipped: number) => {
    if (start + length <= room - margin) return start;
    if (flipped - length >= margin) return flipped - length;
    return Math.max(margin, Math.min(start, room - margin - length));
  };
  return {
    left: Math.round(fit(at.x, size.width, viewport.width, at.x)),
    top: Math.round(fit(at.y, size.height, viewport.height, at.y)),
  };
}

/**
 * The item a key moves to in a menu of `count` items (menus: arrow keys wrap; Home and End),
 * from `current` (-1: none yet). null: the key isn't the menu's.
 */
export function menuIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowDown":
      return current < 0 ? 0 : (current + 1) % count;
    case "ArrowUp":
      return current < 0 ? count - 1 : (current - 1 + count) % count;
    case "Home":
    case "PageUp":
      return 0;
    case "End":
    case "PageDown":
      return count - 1;
    default:
      return null;
  }
}

/** The first item from `current` on whose label starts with the typed letter (type-ahead). */
export function typeAhead(labels: readonly string[], letter: string, current: number): number {
  const l = letter.toLowerCase();
  for (let i = 1; i <= labels.length; i++) {
    const at = (current + i + labels.length) % labels.length;
    if (labels[at]!.toLowerCase().startsWith(l)) return at;
  }
  return -1;
}

/** Whether a key opens a row's menu from the keyboard (the menu key, or Shift+F10). */
export function opensMenu(e: { key: string; shiftKey: boolean }): boolean {
  return e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey);
}

/**
 * Touch and hold: `down` starts the wait, moving past the slop or lifting ends it, and after
 * the delay `onPress` runs with where the finger is. `up` says whether the hold opened the
 * menu, so the tap that ends it doesn't also open the row.
 */
export function createLongPress({
  onPress,
  delay = LONG_PRESS_MS,
  slop = LONG_PRESS_SLOP,
  setTimer = (f, ms) => setTimeout(f, ms),
  clearTimer = (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
}: {
  onPress: (at: { x: number; y: number }) => void;
  delay?: number;
  slop?: number;
  setTimer?: (f: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}) {
  let start: { x: number; y: number } | null = null;
  let last: { x: number; y: number } | null = null;
  let timer: unknown = null;
  let fired = false;
  const stop = () => {
    if (timer != null) clearTimer(timer);
    timer = null;
    start = null;
  };
  return {
    down(x: number, y: number) {
      stop();
      fired = false;
      start = { x, y };
      last = { x, y };
      timer = setTimer(() => {
        timer = null;
        if (!start) return;
        fired = true;
        start = null;
        onPress(last ?? { x, y });
      }, delay);
    },
    move(x: number, y: number) {
      if (!start) return;
      last = { x, y };
      if (Math.hypot(x - start.x, y - start.y) > slop) stop();
    },
    /** The finger lifted: true when the hold already opened the menu. */
    up(): boolean {
      stop();
      const was = fired;
      fired = false;
      return was;
    },
    cancel() {
      stop();
      fired = false;
    },
    /** Waiting for the delay now. */
    get waiting() {
      return start != null;
    },
  };
}

type JobLock = "none" | "day" | "time" | "both";

/** Lock Day or Lock Time from a schedule card: that part on or off, the other part kept. */
export function toggleLock(lock: JobLock, part: "day" | "time"): JobLock {
  const day = lock === "day" || lock === "both";
  const time = lock === "time" || lock === "both";
  const nextDay = part === "day" ? !day : day;
  const nextTime = part === "time" ? !time : time;
  return nextDay && nextTime ? "both" : nextDay ? "day" : nextTime ? "time" : "none";
}

/** Whether that part is locked now (the menu says Unlock Day, then). */
export function hasLock(lock: JobLock, part: "day" | "time"): boolean {
  return lock === "both" || lock === part;
}
