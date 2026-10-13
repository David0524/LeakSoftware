import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { JOB_STATUS_LABELS, type JobStatus } from "@leakbook/core";

// Small, server-safe building blocks styled with the brand tokens (packages/tokens).

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type ButtonKind = "primary" | "secondary" | "quiet" | "danger";

const BUTTON: Record<ButtonKind, string> = {
  // Navy on safety orange: white on orange is too faint (brand/BRAND.md).
  primary: "bg-primary text-on-primary hover:brightness-95",
  secondary: "border-2 border-text text-text bg-surface hover:bg-bg",
  quiet: "text-link hover:underline",
  danger: "border-2 border-status-fail text-status-fail bg-surface hover:bg-bg",
};

export function buttonClass(kind: ButtonKind = "primary", extra?: string) {
  return cx(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 font-display text-[17px] font-bold tracking-wide",
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
  return (
    <section
      {...props}
      className={cx("rounded-lg border border-border bg-surface p-5", className)}
    />
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-extrabold">{title}</h1>
        {subtitle ? <p className="mt-1 text-text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
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
  "block w-full min-h-11 rounded-md border border-control-border bg-surface px-3 py-2 text-text " +
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
          className={cx("text-[15px]", error ? "text-status-fail" : "text-text-muted")}
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
      {hint ? <p className="text-[15px] text-text-muted">{hint}</p> : null}
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
  const border = {
    info: "border-status-info",
    warning: "border-status-warning",
    error: "border-status-fail",
    success: "border-status-pass",
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("rounded-md border-l-4 bg-surface px-4 py-3", border)}
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
        "inline-block rounded-sm px-2 py-0.5 font-display text-[13px] font-bold tracking-wider text-on-status uppercase",
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
  return (
    <p className="rounded-lg border border-dashed border-border p-6 text-text-muted">{children}</p>
  );
}
