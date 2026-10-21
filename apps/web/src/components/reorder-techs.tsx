"use client";

import { useRef, useState, useTransition } from "react";
import { REORDER_TECHS, moveInList } from "@leakbook/core";
import { setScheduleOrder } from "@/app/actions/settings";
import { NO_CONNECTION, whenOffline } from "@/lib/offline";
import { Sheet } from "./sheet";
import { TechDot } from "./tech-dot";
import { showBanner } from "./top-banner";
import { cx } from "./ui";

// Reorder Techs (owner, 2026-10-21: "Make a way to reorder techs in the schedule";
// docs/design/2026-10-21-tech-order.md). Owners and admins: a sheet with the active techs as an
// inset grouped list, each with their color dot, Move Up and Move Down, and a grip to drag
// (pointer or touch; arrow keys on a focused grip). Done saves the order for the whole shop
// (membership.schedule_order); Cancel leaves it as it was.

export interface ReorderTech {
  /** The membership's id (what's saved). */
  id: string;
  name: string;
  color: string | null;
}

export function ReorderTechs({
  techs,
  className,
}: {
  /** The active techs in the Schedule's order now. */
  techs: ReorderTech[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(techs);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const rows = useRef<HTMLUListElement>(null);
  const drag = useRef<{ y0: number; mid: number; row: HTMLElement; from: number } | null>(null);

  const openSheet = () => {
    setList(techs);
    setError(null);
    setOpen(true);
  };
  const move = (from: number, to: number) => setList((l) => moveInList(l, from, to));
  const save = () =>
    start(async () => {
      const r = await whenOffline(setScheduleOrder(list.map((t) => t.id)), {
        error: NO_CONNECTION,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      setOpen(false);
      if (r.message) showBanner({ message: r.message });
    });
  const lift = (row: HTMLElement, on: boolean) => {
    row.style.zIndex = on ? "20" : "";
    row.style.boxShadow = on ? "0 8px 24px rgb(0 0 0 / 0.18)" : "";
    row.style.background = on ? "var(--lb-surface)" : "";
    if (!on) row.style.transform = "";
  };

  if (techs.length < 2) return null;
  return (
    <>
      {/* A round icon button, not a row of its own (owner, 2026-10-21: "shouldn't take up so
          much space"), named for screen readers, its name as the tooltip. */}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={REORDER_TECHS.action}
        title={REORDER_TECHS.action}
        onClick={openSheet}
        className={cx(
          "grid size-11 shrink-0 place-items-center rounded-full text-link active:bg-link/10",
          className,
        )}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 20V5M4 9l4-4 4 4M16 4v15M12 15l4 4 4-4" />
        </svg>
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={REORDER_TECHS.title}
        cancelLabel={REORDER_TECHS.cancel}
        done={{ label: pending ? "Saving…" : REORDER_TECHS.done, onClick: save, disabled: pending }}
      >
        <p className="mb-3 px-1 text-[0.9375rem] text-text-muted">{REORDER_TECHS.help}</p>
        <ul ref={rows} className="grouped" data-testid="reorder-techs">
          {list.map((t, i) => (
            <li
              key={t.id}
              data-reorder-tech={t.id}
              className="flex min-h-14 items-center gap-3 pr-2 pl-4"
            >
              <TechDot color={t.color} />
              <span className="min-w-0 flex-1 truncate text-[1.0625rem]">{t.name}</span>
              <button
                type="button"
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
                aria-label={`${REORDER_TECHS.moveUp}, ${t.name}`}
                title={REORDER_TECHS.moveUp}
                className="grid size-11 shrink-0 place-items-center rounded-full text-link disabled:text-text-muted disabled:opacity-40"
              >
                <Arrow up />
              </button>
              <button
                type="button"
                disabled={i === list.length - 1}
                onClick={() => move(i, i + 1)}
                aria-label={`${REORDER_TECHS.moveDown}, ${t.name}`}
                title={REORDER_TECHS.moveDown}
                className="grid size-11 shrink-0 place-items-center rounded-full text-link disabled:text-text-muted disabled:opacity-40"
              >
                <Arrow />
              </button>
              <button
                type="button"
                aria-label={`Drag ${t.name}`}
                aria-keyshortcuts="ArrowUp ArrowDown"
                data-testid="reorder-tech-grip"
                className="-ml-1 grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-full text-text-muted active:cursor-grabbing"
                onKeyDown={(e) => {
                  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                  e.preventDefault();
                  move(i, e.key === "ArrowUp" ? i - 1 : i + 1);
                  // Keep the grip focused as it moves.
                  const grip = e.currentTarget;
                  requestAnimationFrame(() => grip.focus());
                }}
                onPointerDown={(e) => {
                  const row = e.currentTarget.closest<HTMLElement>("[data-reorder-tech]");
                  if (!row) return;
                  e.preventDefault();
                  const box = row.getBoundingClientRect();
                  drag.current = { y0: e.clientY, mid: box.top + box.height / 2, row, from: i };
                  e.currentTarget.setPointerCapture(e.pointerId);
                  lift(row, true);
                }}
                onPointerMove={(e) => {
                  const g = drag.current;
                  if (g) g.row.style.transform = `translateY(${e.clientY - g.y0}px)`;
                }}
                onPointerUp={(e) => {
                  const g = drag.current;
                  if (!g) return;
                  drag.current = null;
                  const mid = g.mid + (e.clientY - g.y0);
                  const others = [
                    ...(rows.current?.querySelectorAll<HTMLElement>("[data-reorder-tech]") ?? []),
                  ].filter((x) => x !== g.row);
                  const place = others.filter((x) => {
                    const b = x.getBoundingClientRect();
                    return b.top + b.height / 2 < mid;
                  }).length;
                  lift(g.row, false);
                  if (place !== g.from) move(g.from, place);
                }}
                onPointerCancel={() => {
                  const g = drag.current;
                  drag.current = null;
                  if (g) lift(g.row, false);
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                >
                  <path d="M4 8h16M4 12h16M4 16h16" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
        {error ? (
          <p role="alert" className="mt-3 px-1 text-[0.9375rem] text-status-fail">
            {error}
          </p>
        ) : null}
      </Sheet>
    </>
  );
}

function Arrow({ up = false }: { up?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={up ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M6 13l6 6 6-6"} />
    </svg>
  );
}
