import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { JOB_STATUS_LABELS, type JobStatus } from "@leakbook/core";
import { NavBar } from "./nav-bar";

// Small, server-safe building blocks styled with the brand tokens (packages/tokens).

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type ButtonKind = "primary" | "secondary" | "quiet" | "danger" | "onDark";

// Pills (owner, 2026-10-13: "utilize more pills"), styled like iOS buttons (owner, 2026-10-14:
// "feel like Apple"): primary is the filled one, secondary and danger are tinted (a light fill
// of the text color, no outline), quiet is plain text.
const BUTTON: Record<ButtonKind, string> = {
  // Navy on safety orange: white on orange is too faint (brand/BRAND.md).
  primary: "bg-primary text-on-primary hover:brightness-95",
  secondary: "bg-link/12 text-link hover:bg-link/18 active:bg-link/24",
  quiet: "text-link hover:bg-link/10",
  danger: "bg-status-fail/12 text-status-fail hover:bg-status-fail/18 active:bg-status-fail/24",
  // On the navy brand band (the home page hero).
  onDark: "border border-on-header text-on-header hover:bg-white/10",
};

export function buttonClass(kind: ButtonKind = "primary", extra?: string) {
  // A caller's own padding or text size replaces the default. Both would otherwise be in the
  // class list, and the stylesheet (not the list order) decides which wins.
  const pad = /(^|\s)px-/.test(extra ?? "") ? "" : "px-5";
  const size = /(^|\s)text-\[/.test(extra ?? "") ? "" : "text-[1.0625rem]";
  return cx(
    `inline-flex min-h-11 items-center justify-center gap-2 rounded-full ${pad} ${size} font-semibold transition-colors`,
    "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "disabled:cursor-not-allowed disabled:opacity-50",
    BUTTON[kind],
    extra,
  );
}

export function Button({
  kind = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { kind?: ButtonKind }) {
  return <button {...props} className={buttonClass(kind, className)} />;
}

export function ButtonLink({
  kind = "primary",
  className,
  href,
  children,
}: {
  kind?: ButtonKind;
  className?: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(kind, className)}>
      {children}
    </Link>
  );
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section {...props} className={cx("card p-5", className)} />;
}

/**
 * A segmented control's track and its segments (Segmented, the schedule's Day/Week/Month), as
 * on iOS: a gray track with the chosen segment on a raised white thumb.
 */
export const SEGMENT_TRACK =
  "inline-flex max-w-full flex-wrap gap-0.5 rounded-[1.5rem] bg-fill p-0.5";
export function segmentClass(active: boolean, extra?: string) {
  // As with buttons, a caller's own padding replaces the default (icon segments use px-0).
  const pad = /(^|\s)px-/.test(extra ?? "") ? "" : "px-4";
  return cx(
    `min-h-10 content-center rounded-full ${pad} text-center text-[0.9375rem] font-medium whitespace-nowrap transition-colors`,
    active
      ? "bg-thumb font-semibold text-text shadow-[0_3px_8px_rgb(0_0_0/0.12),0_3px_1px_rgb(0_0_0/0.04)]"
      : "text-text hover:bg-text/[0.05]",
    extra,
  );
}

/** A choice in a sideways row of pills (filters, whose day): tinted blue when chosen. */
export function pillClass(active: boolean, extra?: string) {
  return cx(
    "inline-flex min-h-11 shrink-0 items-center rounded-full px-4 font-medium whitespace-nowrap transition-colors",
    active ? "bg-link text-white" : "bg-fill text-text hover:bg-text/[0.1]",
    extra,
  );
}

/**
 * A round icon-only button or link (call, text, email, directions): 44 pt, tinted, and
 * always named for screen readers.
 */
export function iconButtonClass(extra?: string) {
  return cx(
    "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-link/10 text-link transition-colors hover:bg-link/20",
    extra,
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  actionsClassName,
  back,
  navAction,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** For example "hidden sm:flex" when phones show the action elsewhere. */
  actionsClassName?: string;
  /** Where Back goes: "‹ Jobs" in the phone navigation bar, a link above the title when wider. */
  back?: { href: string; label: string };
  /** Phones: the page's main action at the right of the navigation bar (e.g. a "+"). */
  navAction?: ReactNode;
}) {
  const titleId = `title-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <>
      <NavBar title={title} titleId={titleId} back={back} action={navAction} />
      {back ? (
        <p className="mb-2 max-sm:hidden">
          <Link
            href={back.href}
            className="inline-flex min-h-11 items-center gap-1 text-link underline-offset-4 hover:underline"
          >
            ← {back.label}
          </Link>
        </p>
      ) : null}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 sm:mb-6">
        <div className="min-w-0">
          {/* Phones: the iOS large title (34 pt); it hands off to the bar as it scrolls. */}
          <h1
            id={titleId}
            className="font-display text-[2.125rem] leading-tight font-extrabold sm:text-3xl"
          >
            {title}
          </h1>
          {subtitle ? <div className="mt-1 text-text-muted">{subtitle}</div> : null}
        </div>
        {/* empty:hidden: an action component that renders nothing adds no blank row on phones. */}
        {actions ? (
          <div className={cx("flex flex-wrap gap-3 empty:hidden", actionsClassName)}>{actions}</div>
        ) : null}
      </div>
    </>
  );
}

/** A grouped section's header, as iOS draws them: small, gray, above the group. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 font-sans text-[0.8125rem] font-normal tracking-normal text-text-muted uppercase">
      {children}
    </h2>
  );
}

// iOS-style fields: rounded rectangles (not pills). The outline stays at color.controlBorder so
// fields are visible in direct sun (house rule).
const INPUT =
  "block w-full min-h-11 rounded-[10px] border border-control-border bg-surface px-3 py-2 text-text " +
  "placeholder:text-text-muted focus:outline-3 focus:outline-offset-1 focus:outline-focus " +
  "aria-[invalid=true]:border-status-fail";

export function Field({
  label,
  hint,
  error,
  className,
  ...input
}: ComponentProps<"input"> & { label: string; hint?: string; error?: string }) {
  const id = input.id ?? input.name;
  return (
    <div className={cx("space-y-1", className)}>
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      <input
        {...input}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-note` : undefined}
        className={INPUT}
      />
      {error || hint ? (
        <p
          id={`${id}-note`}
          className={cx("text-[0.9375rem]", error ? "text-status-fail" : "text-text-muted")}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextArea({
  label,
  hint,
  className,
  ...input
}: ComponentProps<"textarea"> & { label: string; hint?: string }) {
  const id = input.id ?? input.name;
  return (
    <div className={cx("space-y-1", className)}>
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      <textarea {...input} id={id} className={cx(INPUT, "min-h-24")} />
      {hint ? <p className="text-[0.9375rem] text-text-muted">{hint}</p> : null}
    </div>
  );
}

export function Select({
  label,
  options,
  className,
  ...select
}: ComponentProps<"select"> & {
  label: string;
  options: { value: string; label: string }[];
}) {
  const id = select.id ?? select.name;
  return (
    <div className={cx("space-y-1", className)}>
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      <select {...select} id={id} className={INPUT}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * An on/off choice as an iOS switch: the label on the left, the switch on the right. It is
 * still a checkbox underneath (forms post it the same way); screen readers hear a switch.
 */
export function Checkbox({ label, ...input }: ComponentProps<"input"> & { label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
      <span>{label}</span>
      <input {...input} type="checkbox" role="switch" className="ios-switch" />
    </label>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "error" | "success";
  children: ReactNode;
}) {
  const style = {
    info: "bg-status-info/10 before:bg-status-info",
    warning: "bg-status-warning/10 before:bg-status-warning",
    error: "bg-status-fail/10 before:bg-status-fail",
    success: "bg-status-pass/10 before:bg-status-pass",
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "relative rounded-2xl py-3 pr-4 pl-6 before:absolute before:inset-y-3 before:left-2.5 before:w-1 before:rounded-full",
        style,
      )}
    >
      {children}
    </div>
  );
}

const STATUS_STYLE: Record<JobStatus, string> = {
  unscheduled: "bg-status-excluded",
  scheduled: "bg-text",
  in_progress: "bg-status-info",
  report_sent: "bg-status-info",
  quote_sent: "bg-status-info",
  quote_accepted: "bg-status-warning",
  invoiced: "bg-status-warning",
  paid: "bg-status-pass",
  canceled: "bg-status-excluded",
  done: "bg-status-pass",
};

/** A small status label. Fill colors come from the status tokens; text uses on-status. */
export function Chip({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={cx(
        "inline-block rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap text-on-status",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: JobStatus }) {
  return <Chip label={JOB_STATUS_LABELS[status]} className={STATUS_STYLE[status]} />;
}

/**
 * An iOS inset grouped list: rows on one rounded white block, separated by hairlines that
 * start where the text does. Use with Row.
 */
export function Grouped({
  title,
  footer,
  className,
  children,
}: {
  title?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className}>
      {title ? <SectionTitle>{title}</SectionTitle> : null}
      <ul className="grouped">{children}</ul>
      {footer ? <p className="mt-2 px-4 text-[0.8125rem] text-text-muted">{footer}</p> : null}
    </section>
  );
}

/**
 * One row in a Grouped list: a label (and optional detail) on the left, a value on the right,
 * and a chevron when it opens something.
 */
export function Row({
  label,
  detail,
  value,
  href,
  icon,
  className,
  children,
}: {
  label?: ReactNode;
  detail?: ReactNode;
  value?: ReactNode;
  href?: string;
  icon?: ReactNode;
  className?: string;
  /** Free-form content instead of label/value. */
  children?: ReactNode;
}) {
  const inner = (
    <>
      {icon ? <span className="shrink-0">{icon}</span> : null}
      {children ?? (
        <span className="min-w-0 flex-1">
          <span className="block">{label}</span>
          {detail ? <span className="block text-[0.9375rem] text-text-muted">{detail}</span> : null}
        </span>
      )}
      {value != null ? <span className="shrink-0 text-right text-text-muted">{value}</span> : null}
      {href ? (
        <span aria-hidden="true" className="shrink-0 text-xl leading-none text-text-muted/70">
          ›
        </span>
      ) : null}
    </>
  );
  const row = "flex min-h-11 items-center gap-3 px-4 py-2.5";
  return (
    <li className={className}>
      {href ? (
        <Link href={href} className={cx(row, "active:bg-text/[0.06] hover:bg-text/[0.03]")}>
          {inner}
        </Link>
      ) : (
        <div className={row}>{inner}</div>
      )}
    </li>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-text/[0.04] p-6 text-center text-text-muted">{children}</p>;
}
