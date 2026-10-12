"use client";

import { createContext, use, useActionState, useState, type ReactNode } from "react";
import { contrastGrade, contrastRatio, isHexColor } from "@leakbook/core";
import { tokens } from "@leakbook/tokens";
import type { FormState } from "@/app/actions/auth";
import { Button, Field, TextArea, cx } from "./ui";

const WHITE = tokens.color.brand.paper;
const NAVY = tokens.color.brand.navy;

type Action = (state: FormState, form: FormData) => Promise<FormState>;

const FieldErrors = createContext<Record<string, string> | undefined>(undefined);

/** Field-level error for an input inside a SettingsForm. */
export function useFieldError(name: string): string | undefined {
  return use(FieldErrors)?.[name];
}

/**
 * A settings form posting to a server action. Shows "Saved." or the error next to the
 * button, and passes field errors down to FieldError.
 */
export function SettingsForm({
  action,
  submit = "Save",
  children,
  className,
  danger = false,
  inline = false,
}: {
  action: Action;
  submit?: string;
  children?: ReactNode;
  className?: string;
  danger?: boolean;
  inline?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={cx(!inline && "space-y-4", className)}>
      <FieldErrors value={state.fields}>{children}</FieldErrors>
      <div className={cx("flex flex-wrap items-center gap-3", inline && "self-end")}>
        <Button type="submit" kind={danger ? "danger" : "primary"} disabled={pending}>
          {pending ? "Saving…" : submit}
        </Button>
        <span aria-live="polite" className="text-[15px]">
          {state.error ? (
            <span role="alert" className="text-status-fail">
              {state.error}
            </span>
          ) : state.fields && Object.keys(state.fields).length ? (
            <span className="text-status-fail">Fix the highlighted fields.</span>
          ) : state.message ? (
            <span className="text-status-pass">{state.message}</span>
          ) : null}
        </span>
      </div>
    </form>
  );
}

export function FieldError({ name }: { name: string }) {
  const error = useFieldError(name);
  return error ? (
    <p id={`${name}-error`} className="text-[15px] text-status-fail">
      {error}
    </p>
  ) : null;
}

/** A color input with its hex value and contrast against white and the brand navy. */
export function ColorField({
  name,
  label,
  defaultValue,
  optional = false,
}: {
  name: string;
  label: string;
  defaultValue: string | null;
  optional?: boolean;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const error = useFieldError(name);
  const valid = isHexColor(value);
  // Contrast is symmetric: white text on the color equals the color on white.
  const onWhite = valid ? contrastRatio(value, WHITE) : null;
  const whiteOn = onWhite;
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="block font-medium">
        {label}
        {optional ? <span className="font-normal text-text-muted"> (optional)</span> : null}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={valid ? value : NAVY}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          className="h-11 w-14 cursor-pointer rounded-md border border-neutral-500 bg-surface"
        />
        <input
          id={name}
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={optional ? "None" : NAVY}
          aria-invalid={error ? true : undefined}
          className="min-h-11 w-32 rounded-md border border-neutral-500 bg-surface px-3 font-mono uppercase"
        />
      </div>
      {valid ? (
        <div className="flex flex-wrap gap-2 text-[15px]">
          <span
            className="rounded-md px-3 py-2 font-semibold"
            style={{ backgroundColor: value, color: WHITE }}
          >
            White text {whiteOn}:1 · {contrastGrade(whiteOn!)}
          </span>
          <span
            className="rounded-md border border-border bg-paper px-3 py-2 font-semibold"
            style={{ color: value }}
          >
            On white {onWhite}:1 · {contrastGrade(onWhite!)}
          </span>
        </div>
      ) : null}
      {valid && onWhite! < 3 ? (
        <p className="text-[15px] text-status-warning">
          Too light for text on white. Fine as a fill color behind dark text.
        </p>
      ) : null}
      <FieldError name={name} />
    </div>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        readOnly
        value={url}
        aria-label="Invite link"
        onFocus={(e) => e.target.select()}
        className="min-h-11 min-w-0 flex-1 rounded-md border border-neutral-500 bg-bg px-3 font-mono text-[15px]"
      />
      <Button
        type="button"
        kind="secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Copied" : "Copy Link"}
      </Button>
    </div>
  );
}

/** A text field that shows its error from the surrounding SettingsForm. */
export function SField(props: Parameters<typeof Field>[0]) {
  const error = useFieldError(String(props.name));
  return <Field {...props} error={error} />;
}

export function STextArea(props: Parameters<typeof TextArea>[0]) {
  const error = useFieldError(String(props.name));
  return (
    <div>
      <TextArea {...props} />
      {error ? <p className="text-[15px] text-status-fail">{error}</p> : null}
    </div>
  );
}
