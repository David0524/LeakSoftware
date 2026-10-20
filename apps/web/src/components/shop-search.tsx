"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_GROUP_TITLES,
  SEARCH_OFFLINE,
  SEARCH_PLACEHOLDER,
  SEARCH_WORDS,
  noResultsText,
  normalizeSearch,
  recentFromHit,
  type RecentItem,
  type SearchGroupKey,
  type SearchHit,
  type SearchResults,
} from "@leakbook/core";
import { searchOffice } from "@/app/actions/search";
import { clearRecent, loadRecent, openHref, saveRecent } from "@/lib/recent";
import { cx } from "./ui";

// One search across the shop (owner, 2026-10-20; docs/plans/search-and-activity.md section 1).
// Phones: the field under the Jobs large title, as iOS's .searchable puts it; typing shows the
// grouped results over the list, Cancel returns to it. Computers: a field in the header and
// ⌘K / Ctrl+K from any office page, as a centered panel driven from the keyboard.

type State =
  | { status: "idle" }
  | { status: "loading"; results: SearchResults | null }
  | { status: "done"; results: SearchResults }
  | { status: "offline" };

/** Searches as the person types (debounced), keeping only the answer to the latest query. */
function useShopSearch(query: string, group: SearchGroupKey | null) {
  const [state, setState] = useState<State>({ status: "idle" });
  const latest = useRef(0);
  const ready = normalizeSearch(query).ready;
  useEffect(() => {
    if (!ready) return;
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      setState((s) => ({
        status: "loading",
        results: s.status === "done" ? s.results : s.status === "loading" ? s.results : null,
      }));
      searchOffice(query, group ?? undefined).then(
        (results) => {
          if (ticket === latest.current) setState({ status: "done", results });
        },
        () => {
          if (ticket === latest.current) setState({ status: "offline" });
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, group, ready]);
  return ready ? state : ({ status: "idle" } as State);
}

function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx("size-[1.125rem] shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.8-4.8" />
    </svg>
  );
}

/** An item the keyboard can move to: a result, a Recent entry, or See All. */
interface Item {
  key: string;
  href?: string;
  action?: () => void;
}

/** What to show for the query: Recent, results, nothing found, or no connection. */
function SearchBody({
  query,
  userId,
  group,
  setGroup,
  onOpen,
  active,
  register,
  listId,
}: {
  query: string;
  userId: string;
  group: SearchGroupKey | null;
  setGroup: (g: SearchGroupKey | null) => void;
  onOpen: () => void;
  /** The keyboard's item (desktop panel), by key. */
  active?: string | null;
  /** Reports the items in order, for the arrow keys. */
  register?: (items: Item[]) => void;
  listId: string;
}) {
  const state = useShopSearch(query, group);
  const [recent, setRecent] = useState<RecentItem[]>(() => loadRecent(userId));
  const ready = normalizeSearch(query).ready;
  const results =
    state.status === "done" ? state.results : state.status === "loading" ? state.results : null;

  const remember = (hit: SearchHit) => {
    const item = recentFromHit(hit);
    if (item) setRecent(saveRecent(userId, item));
    onOpen();
  };

  // The order the arrow keys move through.
  const items = useMemo(() => {
    const list: Item[] = [];
    if (!ready)
      recent.forEach((r) => list.push({ key: `r:${r.kind}:${r.id}`, href: openHref(r.open) }));
    else if (results) {
      if (group) list.push({ key: "back", action: () => setGroup(null) });
      for (const g of results.groups) {
        g.hits.forEach((h) =>
          list.push({ key: `h:${h.kind}:${h.id}`, href: h.open ? openHref(h.open) : undefined }),
        );
        if (g.more && !group) list.push({ key: `all:${g.key}`, action: () => setGroup(g.key) });
      }
    }
    return list;
  }, [ready, recent, results, group, setGroup]);
  useEffect(() => {
    register?.(items);
  }, [items, register]);

  const optionProps = (key: string) => ({
    id: `${listId}-${key}`,
    "data-active": active === key ? "" : undefined,
  });
  const rowClass =
    "flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-text/[0.03] active:bg-text/[0.06] data-[active]:bg-link/10";

  if (!ready) {
    return (
      <section aria-label={SEARCH_WORDS.recent}>
        <div className="mb-2 flex items-end justify-between px-4">
          <h2 className="text-[0.8125rem] text-text-muted uppercase">{SEARCH_WORDS.recent}</h2>
          {recent.length ? (
            <button
              type="button"
              onClick={() => {
                clearRecent(userId);
                setRecent([]);
              }}
              className="-my-3 inline-flex min-h-11 items-center px-1 text-[0.9375rem] text-link"
            >
              {SEARCH_WORDS.clear}
            </button>
          ) : null}
        </div>
        {recent.length ? (
          <ul className="grouped" id={listId}>
            {recent.map((r) => {
              const key = `r:${r.kind}:${r.id}`;
              return (
                <li key={key} {...optionProps(key)} className="group">
                  <Link
                    href={openHref(r.open)}
                    onClick={() => {
                      setRecent(saveRecent(userId, r));
                      onOpen();
                    }}
                    className={cx(rowClass, active === key && "bg-link/10")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{r.title}</span>
                      {r.detail ? (
                        <span className="block truncate text-[0.9375rem] text-text-muted">
                          {r.detail}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 text-[0.9375rem] text-text-muted">{SEARCH_WORDS.noRecent}</p>
        )}
      </section>
    );
  }

  if (state.status === "offline") {
    return (
      <p role="alert" className="px-4 py-6 text-center text-text-muted">
        {SEARCH_OFFLINE}
      </p>
    );
  }
  if (!results) {
    return (
      <p role="status" className="px-4 py-6 text-center text-text-muted">
        Searching…
      </p>
    );
  }
  if (results.empty) {
    const none = noResultsText(query);
    return (
      <div role="status" className="px-4 py-8 text-center">
        <p className="font-semibold">{none.title}</p>
        <p className="mt-1 text-[0.9375rem] text-text-muted">{none.hint}</p>
      </div>
    );
  }
  return (
    <div className="space-y-6" id={listId} aria-busy={state.status === "loading"}>
      {group ? (
        <button
          type="button"
          {...optionProps("back")}
          onClick={() => setGroup(null)}
          className={cx(
            "-my-2 inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-link",
            active === "back" && "bg-link/10",
          )}
        >
          <span aria-hidden="true">‹</span> {SEARCH_WORDS.allResults}
        </button>
      ) : null}
      {results.groups.map((g) => (
        <section key={g.key} aria-label={g.title}>
          <div className="mb-2 flex items-end justify-between px-4">
            <h2 className="text-[0.8125rem] text-text-muted uppercase">
              {SEARCH_GROUP_TITLES[g.key]}
            </h2>
            {g.more && !group ? (
              <button
                type="button"
                {...optionProps(`all:${g.key}`)}
                onClick={() => setGroup(g.key)}
                aria-label={`${SEARCH_WORDS.seeAll} ${g.title} (${g.total})`}
                className={cx(
                  "-my-3 inline-flex min-h-11 items-center rounded-full px-2 text-[0.9375rem] text-link",
                  active === `all:${g.key}` && "bg-link/10",
                )}
              >
                {SEARCH_WORDS.seeAll}
              </button>
            ) : null}
          </div>
          <ul className="grouped">
            {g.hits.map((h) => {
              const key = `h:${h.kind}:${h.id}`;
              const inner = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{h.title}</span>
                    {h.detail ? (
                      <span className="block truncate text-[0.9375rem] text-text-muted">
                        {h.detail}
                      </span>
                    ) : null}
                  </span>
                  {h.meta ? (
                    <span className="shrink-0 text-[0.9375rem] text-text-muted">{h.meta}</span>
                  ) : null}
                </>
              );
              return (
                <li key={key} {...optionProps(key)}>
                  {h.open ? (
                    <Link
                      href={openHref(h.open)}
                      onClick={() => remember(h)}
                      className={cx(rowClass, active === key && "bg-link/10")}
                    >
                      {inner}
                      <span aria-hidden="true" className="text-xl leading-none text-text-muted/70">
                        ›
                      </span>
                    </Link>
                  ) : (
                    <div className={rowClass}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** The iOS search field: filled, rounded, the magnifier inside, a clear button once typed in. */
function SearchInput({
  value,
  onChange,
  onFocus,
  onKeyDown,
  inputRef,
  autoFocus,
  activeId,
  listId,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  autoFocus?: boolean;
  activeId?: string;
  listId: string;
}) {
  return (
    <label className="relative flex min-w-0 flex-1 items-center">
      <span className="sr-only">Search</span>
      <SearchGlyph className="pointer-events-none absolute left-2.5 text-text-muted" />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-autocomplete="list"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        autoFocus={autoFocus}
        value={value}
        placeholder={SEARCH_PLACEHOLDER}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        className="min-h-11 w-full min-w-0 rounded-[10px] bg-text/[0.06] pr-3 pl-9 text-[1.0625rem] placeholder:text-text-muted focus:outline-3 focus:outline-focus [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear Text"
          onClick={() => onChange("")}
          className="absolute right-0 inline-flex size-11 items-center justify-center text-text-muted"
        >
          <svg viewBox="0 0 24 24" className="size-[1.125rem]" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.6" />
            <path
              d="m8.5 8.5 7 7m0-7-7 7"
              stroke="var(--lb-surface, #fff)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
    </label>
  );
}

/**
 * Phones (and windows too narrow for the header's field): the search field under the Jobs
 * title. While it is in
 * use the results take the list's place; Cancel puts the list back.
 */
export function PhoneSearch({ userId, children }: { userId: string; children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [group, setGroup] = useState<SearchGroupKey | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const searching = focused || query.length > 0;
  const cancel = () => {
    setQuery("");
    setGroup(null);
    setFocused(false);
    input.current?.blur();
  };
  return (
    <>
      <div role="search" className="mb-5 flex items-center gap-2 md:hidden">
        <SearchInput
          value={query}
          onChange={(v) => {
            setQuery(v);
            setGroup(null);
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
          }}
          inputRef={input}
          listId={listId}
        />
        {searching ? (
          <button
            type="button"
            onClick={cancel}
            className="inline-flex min-h-11 shrink-0 items-center px-1 text-[1.0625rem] text-link"
          >
            {SEARCH_WORDS.cancel}
          </button>
        ) : null}
      </div>
      {searching ? (
        <div className="md:hidden">
          <SearchBody
            query={query}
            userId={userId}
            group={group}
            setGroup={setGroup}
            onOpen={() => setFocused(false)}
            listId={listId}
          />
        </div>
      ) : null}
      <div className={cx(searching && "max-md:hidden")}>{children}</div>
    </>
  );
}

const isMac = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * Computers: a search field in the header (before New Job) that opens the search panel, as
 * does ⌘K (Ctrl+K) from any office page. Arrow keys move through the results, Return opens
 * one, Escape closes.
 */
export function DesktopSearch({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [mac, setMac] = useState(true);
  useEffect(() => {
    // The shortcut's name follows the keyboard (read once mounted, so the server's HTML matches).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a browser-only fact
    setMac(isMac());
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const shortcut = mac ? "⌘K" : "Ctrl+K";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Search (${shortcut})`}
        aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
        // Narrower windows search from the top of Jobs, as phones do (the header is full).
        className="mr-2 inline-flex min-h-11 items-center max-md:hidden"
      >
        <span className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-text/[0.06] px-3 text-[0.9375rem] text-text-muted hover:bg-text/[0.09] max-lg:px-2.5 lg:w-56">
          <SearchGlyph />
          <span className="flex-1 text-left max-lg:sr-only">Search</span>
          <kbd className="font-sans text-[0.8125rem] max-lg:hidden">{shortcut}</kbd>
        </span>
      </button>
      {open ? <SearchPanel userId={userId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SearchPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<SearchGroupKey | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const listId = useId();
  const before = useRef<HTMLElement | null>(null);

  useEffect(() => {
    before.current = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      before.current?.focus?.();
    };
  }, []);

  const register = useCallback((next: Item[]) => {
    setItems(next);
    setActive((a) => (a && next.some((i) => i.key === a) ? a : (next[0]?.key ?? null)));
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (group) setGroup(null);
      else onClose();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      const i = items.findIndex((x) => x.key === active);
      const next =
        e.key === "ArrowDown"
          ? Math.min(items.length - 1, i + 1)
          : Math.max(0, (i < 0 ? items.length : i) - 1);
      const key = items[next]!.key;
      setActive(key);
      document.getElementById(`${listId}-${key}`)?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key === "Enter") {
      const item = items.find((x) => x.key === active);
      if (!item) return;
      e.preventDefault();
      if (item.action) return item.action();
      // The row's own link remembers it under Recent.
      const link = document.getElementById(`${listId}-${item.key}`)?.querySelector("a");
      if (link) link.click();
      else if (item.href) {
        router.push(item.href);
        onClose();
      }
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="glass-sheet flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/10"
      >
        <div className="flex items-center gap-2 border-b-[0.5px] border-separator p-3">
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setGroup(null);
            }}
            onKeyDown={onKeyDown}
            autoFocus
            listId={listId}
            activeId={active ? `${listId}-${active}` : undefined}
          />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 shrink-0 items-center px-2 text-link"
          >
            {SEARCH_WORDS.cancel}
          </button>
        </div>
        <div className="overflow-y-auto bg-bg py-4">
          <SearchBody
            query={query}
            userId={userId}
            group={group}
            setGroup={setGroup}
            onOpen={onClose}
            active={active}
            register={register}
            listId={listId}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
