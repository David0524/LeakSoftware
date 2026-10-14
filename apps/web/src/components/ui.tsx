import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { JOB_STATUS_LABELS, type JobStatus } from "@leakbook/core";

// Small, server-safe building blocks styled with the brand tokens (packages/tokens).

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type ButtonKind = "primary" | "secondary" | "quiet" | "danger" | "onDark";

// Pills (owner, 2026-10-13: "utilize more pills"). Outlines stay in color.controlBorder.
const BUTTON: Record<ButtonKind, string> = {
  // Navy on safety orange: white on orange is too faint (brand/BRAND.md).
  primary: "bg-primary text-on-primary shadow-sm hover:brightness-95",
  secondary: "border border-control-border text-text bg-surface hover:bg-bg",
  quiet: "text-link hover:bg-link/10",
  danger: "border border-status-fail text-status-fail bg-surface hover:bg-status-fail/10",
  // On the navy brand band (the home page hero).
  onDark: "border border-on-header text-on-header hover:bg-white/10",
};

export function buttonClass(kind: ButtonKind = "primary", extra?: string) {
  return cx(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 font-display text-[1.0625rem] font-bold tracking-wide transition-colors",
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

/** A segmented control's track and its segments (Segmented, the schedule's Day/Week/Month). */
export const SEGMENT_TRACK =
  "inline-flex max-w-full flex-wrap gap-0.5 rounded-[1.5rem] bg-text/[0.07] p-1";
export function segmentClass(active: boolean, extra?: string) {
  return cx(
    "min-h-11 content-center rounded-full px-4 text-center font-medium whitespace-nowrap transition-colors",
    active ? "bg-text text-bg shadow-sm" : "text-text hover:bg-text/[0.06]",
    extra,
  );
}

/** A choice in a sideways row of pills (filters, whose day): navy when chosen. */
export function pillClass(active: boolean, extra?: string) {
  return cx(
    "inline-flex min-h-11 shrink-0 items-center rounded-full px-4 font-medium whitespace-nowrap transition-colors",
    active ? "bg-text text-bg" : "bg-surface text-text shadow-sm hover:bg-text/[0.06]",
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
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 sm:mb-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold">{title}</h1>
        {subtitle ? <p className="mt-1 text-text-muted">{subtitle}</p> : null}
      </div>
      {/* empty:hidden: an action component that renders nothing adds no blank row on phones. */}
      {actions ? <div className="flex flex-wrap gap-3 empty:hidden">{actions}</div> : null}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 font-display text-sm font-semibold tracking-widest text-text-muted uppercase">
      {children}
    </h2>
  );
}

const INPUT =
  "block w-full min-h-11 rounded-xl border border-control-border bg-surface px-3 py-2 text-text " +
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

export function Checkbox({ label, ...input }: ComponentProps<"input"> & { label: string }) {
  return (
    <label className="flex min-h-11 items-center gap-3">
      <input {...input} type="checkbox" className="size-5 accent-water" />
      <span>{label}</span>
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

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-text/[0.04] p-6 text-center text-text-muted">{children}</p>;
}
