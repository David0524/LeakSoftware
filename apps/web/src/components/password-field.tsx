"use client";

import { useId, useState, type ComponentProps } from "react";
import { PASSWORD_RULES, passwordChecks, passwordScore } from "@leakbook/core";
import { EyeIcon, EyeSlashIcon } from "./icons";
import { FieldNote, GROUP_ROW, cx } from "./ui";

/**
 * A password row in a FieldGroup, like GroupedField, with an eye button to show or hide what's
 * typed (owner, 2026-10-24) and, for a new password, the rules as a checklist with a bar that
 * fills as they're met. The rules are packages/core/src/password.ts, the same on the iPhone and
 * Android apps; the server checks them again, and so does Supabase.
 */
export function PasswordField({
  label,
  hint,
  error,
  meter = false,
  className,
  ...input
}: Omit<ComponentProps<"input">, "type"> & {
  label: string;
  hint?: string;
  error?: string;
  /** A new password: show the rules as they're met. */
  meter?: boolean;
}) {
  const auto = useId();
  const id = input.id ?? `${input.name ?? "password"}-${auto}`;
  const [shown, setShown] = useState(false);
  const [value, setValue] = useState(String(input.defaultValue ?? ""));
  const describedBy = [error || hint ? `${id}-note` : null, meter ? `${id}-rules` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cx(GROUP_ROW, className)}>
      {/* Narrower than 280px (a phone zoomed to 200%), the label goes above so the field and
          its eye button keep their room. */}
      <div className="max-sm:flex max-sm:min-h-11 max-sm:items-center max-sm:gap-3 max-[280px]:flex-col max-[280px]:items-stretch max-[280px]:gap-0 max-[280px]:pt-2.5">
        <label
          htmlFor={id}
          className="block max-sm:w-(--label-w) max-sm:shrink-0 max-[280px]:w-auto sm:mb-1 sm:font-medium"
        >
          {label}
        </label>
        <div className="relative flex min-w-0 items-center max-sm:flex-1">
          <input
            {...input}
            id={id}
            type={shown ? "text" : "password"}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              setValue(e.target.value);
              input.onChange?.(e);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            className={cx(
              "block w-full min-h-11 min-w-0 text-text placeholder:text-placeholder disabled:text-text-muted",
              "max-sm:flex-1 max-sm:rounded-md max-sm:bg-transparent max-sm:focus-visible:outline-offset-0",
              "sm:rounded-[10px] sm:border sm:border-control-border sm:bg-surface sm:py-2 sm:pr-12 sm:pl-3",
              "sm:focus:outline-3 sm:focus:outline-offset-1 sm:focus:outline-focus sm:aria-[invalid=true]:border-status-fail",
            )}
          />
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? "Hide password" : "Show password"}
            aria-pressed={shown}
            aria-controls={id}
            className={cx(
              "flex size-11 shrink-0 items-center justify-center rounded-full text-text-muted",
              "hover:text-text focus-visible:outline-3 focus-visible:outline-focus",
              "sm:absolute sm:top-0 sm:right-0.5",
            )}
          >
            {shown ? <EyeSlashIcon /> : <EyeIcon />}
          </button>
        </div>
      </div>
      <FieldNote id={String(id)} hint={hint} error={error} />
      {meter ? <PasswordMeter id={`${id}-rules`} password={value} /> : null}
    </div>
  );
}

/** The rules as a checklist with a bar: quiet gray until each is met. */
function PasswordMeter({ id, password }: { id: string; password: string }) {
  const checks = passwordChecks(password);
  const score = passwordScore(password);
  const total = PASSWORD_RULES.length;
  return (
    <div id={id} className="pt-1 pb-3 sm:pt-2 sm:pb-0" data-testid="password-meter">
      <div
        role="meter"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={score}
        aria-valuetext={`${score} of ${total} rules met`}
        className="flex gap-1"
      >
        {PASSWORD_RULES.map((r, i) => (
          <span
            key={r.id}
            className={cx(
              "h-1 flex-1 rounded-full transition-colors motion-reduce:transition-none",
              i < score ? (score === total ? "bg-status-pass" : "bg-primary") : "bg-separator",
            )}
          />
        ))}
      </div>
      <ul className="mt-2 grid gap-y-0.5 text-[0.9375rem]">
        {PASSWORD_RULES.map((r) => (
          <li
            key={r.id}
            className={cx(
              "flex items-center gap-2",
              checks[r.id] ? "text-text" : "text-text-muted",
            )}
          >
            <span
              aria-hidden="true"
              className={cx("w-4 text-center", checks[r.id] ? "text-status-pass" : "")}
            >
              {checks[r.id] ? "✓" : "○"}
            </span>
            {r.label}
            <span className="sr-only">{checks[r.id] ? ", met" : ", not yet"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
