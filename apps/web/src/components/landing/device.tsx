import type { CSSProperties, ReactNode } from "react";
import { cx } from "../ui";

// Devices and small pieces of the app's look for the home page's demos. The demos are
// illustrations (aria-hidden); each one's section says in words what it shows.

/** An iPhone-shaped frame (19.5:9) holding a screen of the app. */
export function Phone({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        "relative aspect-[9/19.5] w-[280px] shrink-0 rounded-[3rem] bg-[#16181c] p-[10px] shadow-[0_30px_60px_-20px_rgb(18_38_58/0.45),0_0_0_1px_rgb(255_255_255/0.08)_inset] select-none sm:w-[300px]",
        className,
      )}
    >
      <div className="relative h-full overflow-hidden rounded-[2.4rem] bg-bg text-left text-text">
        {/* status bar and Dynamic Island */}
        <div className="absolute inset-x-0 top-0 z-30 flex h-11 items-center justify-between px-7 text-[0.8rem] font-semibold">
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <Bars />
            <span className="inline-block h-2.5 w-5 rounded-[3px] border border-current p-[1px]">
              <span className="block h-full w-3/4 rounded-[1px] bg-current" />
            </span>
          </span>
        </div>
        <div className="absolute top-2.5 left-1/2 z-30 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />
        <div className="absolute inset-x-0 top-11 bottom-0">{children}</div>
        <div className="absolute bottom-1.5 left-1/2 z-30 h-1 w-28 -translate-x-1/2 rounded-full bg-text/80" />
      </div>
    </div>
  );
}

function Bars({ off = false }: { off?: boolean }) {
  return (
    <span className="flex items-end gap-[2px]">
      {[4, 6, 8, 10].map((h, i) => (
        <span
          key={h}
          className={cx(
            "w-[3px] rounded-[1px] bg-current transition-opacity",
            off && i > 0 && "opacity-25",
          )}
          style={{ height: h }}
        />
      ))}
    </span>
  );
}

/** A laptop-shaped frame for the office screens. */
export function Laptop({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div aria-hidden="true" className={cx("w-full select-none", className)}>
      <div className="rounded-[1.25rem] bg-[#16181c] p-2.5 shadow-[0_30px_60px_-24px_rgb(18_38_58/0.45)]">
        <div className="overflow-hidden rounded-[0.7rem] bg-bg text-text">{children}</div>
      </div>
      <div className="mx-auto h-3 w-[104%] -translate-x-[2%] rounded-b-2xl bg-[#c9ced5] dark:bg-[#3a3f46]" />
    </div>
  );
}

/** The office's navy top bar, as in the app. */
export function OfficeBar({ active }: { active: string }) {
  return (
    <div className="flex items-center gap-4 bg-header px-4 py-2.5 text-[0.75rem] font-semibold text-on-header">
      <span className="font-display text-[0.95rem] font-bold">Sundeck Pro</span>
      {["Today", "Jobs", "Schedule", "Customers", "Invoices", "Dashboard"].map((t) => (
        <span
          key={t}
          className={cx("rounded-md px-2 py-1 max-sm:hidden", t === active && "bg-white/15")}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

const VERDICT = {
  pass: "bg-status-pass",
  fail: "bg-status-fail",
  warn: "bg-status-warning",
  na: "bg-status-excluded",
} as const;

/** A verdict pill (Not Leaking, Leaking, Attention, N/A), white on the status color. */
export function Verdict({
  tone,
  children,
  className,
  style,
}: {
  tone: keyof typeof VERDICT;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={style}
      className={cx(
        "inline-flex min-w-[6.2rem] items-center justify-between gap-1 rounded-full px-3 py-1 text-[0.72rem] font-semibold text-white",
        VERDICT[tone],
        className,
      )}
    >
      {children}
      <svg
        viewBox="0 0 10 6"
        className="h-1.5 w-2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M1 1l4 4 4-4" />
      </svg>
    </span>
  );
}

/** A large iOS title with a secondary line under it. */
export function ScreenTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="px-4 pt-2 pb-2">
      <p className="font-display text-[1.6rem] leading-tight font-extrabold">{title}</p>
      {sub ? <p className="text-[0.78rem] text-text-muted">{sub}</p> : null}
    </div>
  );
}

/** The app's floating tab bar. */
export function TabBar({ active }: { active: string }) {
  return (
    <div className="glass absolute inset-x-3 bottom-4 z-20 flex justify-around rounded-full px-2 py-1.5 text-[0.6rem]">
      {["Today", "Jobs", "Schedule", "Customers", "More"].map((t) => (
        <span
          key={t}
          className={cx(
            "flex flex-col items-center gap-0.5",
            t === active ? "text-link" : "text-text-muted",
          )}
        >
          <span
            className={cx("size-3.5 rounded-full", t === active ? "bg-link" : "bg-text-muted/40")}
          />
          {t}
        </span>
      ))}
    </div>
  );
}

/** The pool diagram's kidney outline (the same shape the app draws), as an SVG path. */
export const KIDNEY =
  "M60 70 C40 30 120 10 170 40 C200 58 230 30 270 34 C330 40 350 110 320 150 C290 190 200 200 140 190 C80 182 30 160 34 120 C36 98 70 96 60 70 Z";

/** A numbered finding pin, red for leaking and gray for minor. */
export function Pin({ n, tone = "fail" }: { n: number; tone?: "fail" | "minor" }) {
  return (
    <span
      className={cx(
        "grid size-6 place-items-center rounded-full text-[0.7rem] font-bold text-white ring-2 ring-white",
        tone === "fail" ? "bg-status-fail" : "bg-status-excluded",
      )}
    >
      {n}
    </span>
  );
}
