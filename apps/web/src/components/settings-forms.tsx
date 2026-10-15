"use client";

import {
  createContext,
  use,
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { contrastGrade, contrastRatio, isHexColor } from "@leakbook/core";
import { tokens } from "@leakbook/tokens";
import type { FormState } from "@/app/actions/auth";
import { useConfirm } from "./sheet";
import { Banner } from "./doc-ui";
import {
  Button,
  Checkbox,
  Field,
  FieldGroup,
  GROUP_ROW,
  GroupedField,
  GroupedSelect,
  GroupedSwitch,
  GroupedTextArea,
  SectionTitle,
  Select,
  TextArea,
  cx,
} from "./ui";

const WHITE = tokens.color.brand.paper;
const NAVY = tokens.color.brand.navy;

type Action = (state: FormState, form: FormData) => Promise<FormState>;

const FieldErrors = createContext<Record<string, string> | undefined>(undefined);

/**
 * Set by a settings sheet (settings-list.tsx): a form inside it that succeeds calls this with
 * its message, so the sheet closes and the page shows the message.
 */
export const SheetDone = createContext<((message: string) => void) | undefined>(undefined);

/** Set by SettingsFields: fields inside it draw as rows of an iOS grouped block on phones. */
const InGroup = createContext(false);

/** Field-level error for an input inside a SettingsForm. */
export function useFieldError(name: string): string | undefined {
  return use(FieldErrors)?.[name];
}

/**
 * A settings form posting to a server action. Shows "Saved." or the error next to the
 * button (under a full-width button, as a banner), and passes field errors down to FieldError.
 */
export function SettingsForm({
  action,
  submit = "Save",
  children,
  className,
  danger = false,
  primary = false,
  confirm,
  inline = false,
  full = false,
  onSaved,
}: {
  action: Action;
  submit?: string;
  children?: ReactNode;
  className?: string;
  danger?: boolean;
  /** The page's main form. One filled (primary) button per page (house rule). */
  primary?: boolean;
  /** Ask before submitting, e.g. "Remove this item?". */
  confirm?: string;
  inline?: boolean;
  /** One full-width button, with what happened in a banner under it (iOS forms). */
  full?: boolean;
  /** Called after a save that succeeded, e.g. to close the form. */
  onSaved?: () => void;
}) {
  const sheetDone = use(SheetDone);
  const done = useRef(sheetDone);
  useEffect(() => {
    done.current = sheetDone;
  });
  // In a sheet, a save that worked closes it. Called from the action itself (not an effect),
  // so it still happens when the save removes the row the sheet belongs to.
  const [state, formAction, pending] = useActionState(async (prev: FormState, data: FormData) => {
    const next = await action(prev, data);
    if (next.message && !next.error) done.current?.(next.message);
    return next;
  }, {});
  const [ask, confirmSheet] = useConfirm();
  const form = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const saved = useRef(onSaved);
  useEffect(() => {
    saved.current = onSaved;
  });
  useEffect(() => {
    if (state.message && !state.error) saved.current?.();
  }, [state]);
  const invalid = !!state.fields && Object.keys(state.fields).length > 0;
  const button = (
    <Button
      type="submit"
      kind={danger ? "danger" : primary ? "primary" : "secondary"}
      disabled={pending}
      className={full ? "w-full" : undefined}
      onClick={(e) => {
        // Ask with an action sheet first; once confirmed, submit for real.
        if (!confirm || confirmed.current) {
          confirmed.current = false;
          return;
        }
        e.preventDefault();
        void ask({
          title: confirm,
          confirmLabel: submit,
          destructive: danger,
        }).then((ok) => {
          if (!ok) return;
          confirmed.current = true;
          (e.target as HTMLButtonElement).click();
        });
      }}
    >
      {pending ? "Saving…" : submit}
    </Button>
  );
  return (
    <form ref={form} action={formAction} className={cx(!inline && "space-y-4", className)}>
      <FieldErrors value={state.fields}>{children}</FieldErrors>
      {full ? (
        <div className="space-y-3">
          {button}
          {state.error ? (
            <Banner tone="error">{state.error}</Banner>
          ) : invalid ? (
            <Banner tone="error">Fix the highlighted fields.</Banner>
          ) : state.message ? (
            <Banner tone="success">{state.message}</Banner>
          ) : null}
        </div>
      ) : (
        <div className={cx("flex flex-wrap items-center gap-3", inline && "self-end")}>
          {button}
          <span aria-live="polite" className="text-[0.9375rem]">
            {state.error ? (
              <span role="alert" className="text-status-fail">
                {state.error}
              </span>
            ) : invalid ? (
              <span className="text-status-fail">Fix the highlighted fields.</span>
            ) : state.message ? (
              <span className="text-status-pass">{state.message}</span>
            ) : null}
          </span>
        </div>
      )}
      {confirmSheet}
    </form>
  );
}

/**
 * A form's fields as one iOS inset grouped block on phones (label on the left of each row,
 * switches at the right); labels above outlined fields on wider screens. SField, STextArea,
 * SSelect, SSwitch, and ColorField inside it draw as its rows.
 */
export function SettingsFields({
  labelWidth = "8rem",
  className,
  children,
}: {
  labelWidth?: string;
  /** Wider screens' layout, e.g. a grid. Defaults to a stack. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <InGroup value={true}>
      <FieldGroup labelWidth={labelWidth} className={className}>
        {children}
      </FieldGroup>
    </InGroup>
  );
}

/**
 * A titled part of a settings page: the small gray header above it, as iOS groups settings.
 * Phones: the fields' own grouped block sits on the page. Wider: a card.
 */
export function SettingsSection({
  title,
  titleId,
  boxed = false,
  children,
}: {
  title: ReactNode;
  /** Names the section (a region) by its title. */
  titleId?: string;
  /** Content that isn't grouped fields (text, a button): a white block on phones too. */
  boxed?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={titleId}>
      <SectionTitle>{titleId ? <span id={titleId}>{title}</span> : title}</SectionTitle>
      <div
        className={cx(
          "card p-5",
          boxed
            ? "max-sm:rounded-xl max-sm:p-4 max-sm:shadow-none"
            : "max-sm:rounded-none max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none",
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function FieldError({ name }: { name: string }) {
  const error = useFieldError(name);
  return error ? (
    <p id={`${name}-error`} className="text-[0.9375rem] text-status-fail">
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
  id = name,
}: {
  name: string;
  label: string;
  defaultValue: string | null;
  optional?: boolean;
  /** Unique per page when several forms share a field name (M11 review C3). */
  id?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const error = useFieldError(name);
  const valid = isHexColor(value);
  // Contrast is symmetric: white text on the color equals the color on white.
  const onWhite = valid ? contrastRatio(value, WHITE) : null;
  const whiteOn = onWhite;
  return (
    <div className={cx("space-y-2", GROUP_ROW, "max-sm:py-2.5")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:block sm:space-y-2">
        <label htmlFor={id} className="block flex-1 sm:font-medium">
          {label}
          {optional ? <span className="text-text-muted sm:font-normal"> (optional)</span> : null}
        </label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label={`${label} picker`}
            value={valid ? value : NAVY}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            className="h-11 w-14 cursor-pointer rounded-xl border border-control-border bg-surface"
          />
          <input
            id={id}
            name={name}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={optional ? "None" : NAVY}
            aria-invalid={error ? true : undefined}
            className="min-h-11 w-32 rounded-xl border border-control-border bg-surface px-3 font-mono uppercase"
          />
        </div>
      </div>
      {valid ? (
        <div className="flex flex-wrap gap-2 text-[0.9375rem]">
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
        <p className="text-[0.9375rem] text-status-warning">
          Too light for text on white. Fine as a fill color behind dark text.
        </p>
      ) : null}
      <FieldError name={name} />
    </div>
  );
}

export function CopyLink({
  url,
  label = "Invite link",
  button = "Copy Link",
}: {
  url: string;
  label?: string;
  button?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        readOnly
        value={url}
        aria-label={label}
        onFocus={(e) => e.target.select()}
        className="min-h-11 min-w-0 flex-1 rounded-xl border border-control-border bg-bg px-3 font-mono text-[0.9375rem]"
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
        {copied ? "Copied" : button}
      </Button>
    </div>
  );
}

/**
 * A text field that shows its error from the surrounding SettingsForm. Inside SettingsFields
 * it is a grouped row (`stacked` puts a long label above the field on phones).
 */
export function SField({ stacked, ...props }: Parameters<typeof Field>[0] & { stacked?: boolean }) {
  const error = useFieldError(String(props.name));
  if (use(InGroup)) return <GroupedField {...props} stacked={stacked} error={error} />;
  return <Field {...props} error={error} />;
}

export function STextArea(props: Parameters<typeof TextArea>[0]) {
  const error = useFieldError(String(props.name));
  if (use(InGroup)) return <GroupedTextArea {...props} error={error} />;
  return (
    <div>
      <TextArea {...props} />
      {error ? <p className="text-[0.9375rem] text-status-fail">{error}</p> : null}
    </div>
  );
}

/** A choice; inside SettingsFields, a grouped row with the value on the right (phones). */
export function SSelect(props: Parameters<typeof GroupedSelect>[0]) {
  const error = useFieldError(String(props.name));
  if (use(InGroup)) return <GroupedSelect {...props} error={error} />;
  const { hint, ...rest } = props;
  return (
    <div>
      <Select {...rest} />
      {error || hint ? (
        <p className={cx("text-[0.9375rem]", error ? "text-status-fail" : "text-text-muted")}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}

/** An on/off setting; inside SettingsFields, a switch row. */
export function SSwitch(props: Parameters<typeof GroupedSwitch>[0]) {
  if (use(InGroup)) return <GroupedSwitch {...props} />;
  const { hint, ...rest } = props;
  return (
    <div>
      <Checkbox {...rest} />
      {hint ? <p className="text-[0.9375rem] text-text-muted">{hint}</p> : null}
    </div>
  );
}
