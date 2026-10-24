"use client";

import {
  createContext,
  startTransition,
  use,
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { requestFormReset } from "react-dom";
import {
  brandColorChoices,
  isHexColor,
  logoPalette,
  suggestedBrandColor,
  textOnBrand,
} from "@leakbook/core";
import { tokens } from "@leakbook/tokens";
import type { FormState } from "@/app/actions/auth";
import { fieldsOf, signature } from "@/lib/dirty";
import { orOffline } from "@/lib/offline";
import { useConfirm } from "./sheet";
import { Banner } from "./doc-ui";
import { useTyping } from "./next-step-events";
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
function useFieldError(name: string): string | undefined {
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
  pinned = false,
  floating = false,
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
  /**
   * In a sheet: the button sits in a bar pinned to the bottom of the sheet, always in reach,
   * not at the end of the scroll (owner, 2026-10-20).
   */
  pinned?: boolean;
  /**
   * The page's one Save, floating at the bottom (owner, 2026-10-22: Company and Branding):
   * dimmed until a field changes, "Saving…", then "Saved." until the next change.
   */
  floating?: boolean;
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
    const next = await orOffline(action)(prev, data);
    if (next.message && !next.error) {
      done.current?.(next.message);
      // Cleared only after a save that worked: one that failed keeps what was typed (a
      // form's action prop cleared it either way, so a missing date emptied New Job).
      if (form.current) requestFormReset(form.current);
    }
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
      className={full || pinned ? "w-full" : undefined}
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
    <form
      ref={form}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(data));
      }}
      className={cx(!inline && "space-y-4", className)}
    >
      <FieldErrors value={state.fields}>{children}</FieldErrors>
      {floating ? (
        <SaveBar
          form={form}
          pending={pending}
          state={state}
          error={state.error ?? (invalid ? "Fix the highlighted fields." : undefined)}
        />
      ) : full ? (
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
        <div
          className={cx(
            "flex flex-wrap items-center gap-3",
            inline && "self-end",
            // The sheet's scroll area has 1.5rem of padding below: pin to its very bottom.
            pinned &&
              "sticky -bottom-6 z-10 -mx-4 border-t-[0.5px] border-separator bg-bg px-4 py-3",
          )}
        >
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
 * Fired (bubbling) by a field whose value was set by the page rather than typed: the logo's
 * color filling Main color. The Save bar checks for changes on it; the Discard changes guard
 * doesn't hear it, since the owner changed nothing.
 */
const FIELD_SET = "leakbook:field-set";

/**
 * A page's one Save (owner, 2026-10-22: "Let's remove all the save buttons on that page and
 * just have one floating one on the bottom"): the Next Step bar's floating glass, kept in view
 * at the bottom of the page (above the tab bar on phones) while the form scrolls. Save is dimmed
 * until a field differs from what was loaded or last saved; "Saved." shows above it until the
 * next change, a problem until the next Save. Hidden on phones while a field has the keyboard,
 * as the Next Step bar is. The same bar is SaveBar.swift on the iPhone and ui/SaveBar.tsx on
 * Android.
 */
function SaveBar({
  form,
  pending,
  state,
  error,
}: {
  form: RefObject<HTMLFormElement | null>;
  pending: boolean;
  state: FormState;
  error?: string;
}) {
  const typing = useTyping();
  const baseline = useRef<string | null>(null);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    const el = form.current;
    if (!el) return;
    const measure = () => signature(fieldsOf(el));
    // What was loaded, typed fields as the page's HTML gave them: a field typed into while the
    // page was still loading counts as a change.
    baseline.current ??= signature(fieldsOf(el, { loaded: true }));
    // Read after the event's own updates have drawn (a swatch's color, a segment's choice).
    const check = () =>
      setTimeout(() => {
        if (el.isConnected) setChanged(measure() !== baseline.current);
      }, 0);
    check();
    el.addEventListener("input", check);
    el.addEventListener("change", check);
    el.addEventListener("click", check);
    el.addEventListener(FIELD_SET, check);
    return () => {
      el.removeEventListener("input", check);
      el.removeEventListener("change", check);
      el.removeEventListener("click", check);
      el.removeEventListener(FIELD_SET, check);
    };
  }, [form]);
  // Saved: what the fields hold now (after the form's reset to the saved values) is the new
  // starting point.
  useEffect(() => {
    if (!state.message || state.error) return;
    const id = setTimeout(() => {
      if (!form.current) return;
      baseline.current = signature(fieldsOf(form.current));
      setChanged(false);
    }, 0);
    return () => clearTimeout(id);
  }, [state, form]);
  const line = error
    ? { text: error, ok: false }
    : state.message && !changed
      ? { text: state.message, ok: true }
      : null;
  return (
    <div
      className={cx(
        "sticky z-30 mt-6 bottom-[calc(var(--tab-bar-top)+var(--tab-bar-row)+2px+var(--tab-bar-bottom))] sm:bottom-4",
        typing && "max-sm:hidden",
      )}
      data-testid="save-bar"
    >
      <div className="glass flex flex-col gap-1 rounded-[28px] p-2">
        <p
          aria-live="polite"
          role={line && !line.ok ? "alert" : undefined}
          className={cx(
            "flex items-center justify-center gap-1.5 px-3 text-center text-[0.9375rem] font-semibold",
            line ? "min-h-7" : "hidden",
            line?.ok ? "text-status-pass" : "text-status-fail",
          )}
        >
          {line?.ok ? (
            <svg aria-hidden="true" viewBox="0 0 20 20" className="size-[1.0625rem] shrink-0">
              <circle cx="10" cy="10" r="10" fill="currentColor" />
              <path
                d="M5.8 10.3l2.8 2.8 5.6-5.8"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
          {line?.text}
        </p>
        <Button type="submit" kind="primary" disabled={pending || !changed} className="w-full">
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
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

/**
 * The shop's logo and colors (owner, 2026-10-22: "You should auto fill company colors based on
 * the logo, and give a picker. A hex code alone is not useful"). Choosing a logo reads its
 * colors in the browser and fills the main color with the top one; a logo already there fills
 * it only while the color is still the default. The logo's colors lead the swatches.
 */
export function BrandingFields({
  logoUrl,
  logoPath = null,
  companyName,
  primary,
  secondary,
}: {
  logoUrl: string | null;
  /** The stored logo's file: its colors are read once per logo, not per signed address. */
  logoPath?: string | null;
  companyName: string;
  primary: string;
  secondary: string | null;
}) {
  const [preview, setPreview] = useState(logoUrl);
  const [palette, setPalette] = useState<string[]>([]);
  const [main, setMain] = useState(primary);
  const [picked, setPicked] = useState(false);

  function apply(colors: string[], newLogo: boolean) {
    setPalette(colors);
    const next = suggestedBrandColor(colors, main, newLogo);
    if (next) {
      setMain(next);
      setPicked(true);
    }
  }

  // The stored logo is read once per logo; a newly chosen one is read in onChange. A save gives
  // the page a new signed address for the same logo: reading it again filled the default main
  // color from the logo after the save, so the page looked changed and leaving asked "Discard
  // changes?" (owner, 2026-10-22). Only the page's first read suggests a color.
  const readLogo = useRef<string | null>(null);
  useEffect(() => {
    const key = logoPath ?? logoUrl;
    if (!logoUrl || !key || readLogo.current === key) return;
    const first = readLogo.current === null;
    readLogo.current = key;
    void imagePalette(logoUrl).then((colors) =>
      first ? apply(colors, false) : setPalette(colors),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoPath, logoUrl]);

  return (
    <>
      <div className={cx("space-y-2", GROUP_ROW, "max-sm:py-2.5")}>
        <label htmlFor="logo" className="block sm:font-medium">
          Logo
        </label>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL or local file
          <img
            src={preview}
            alt={`${companyName} logo`}
            className="max-h-20 rounded-md border border-border bg-paper p-2"
          />
        ) : (
          <p className="text-text-muted">No logo yet. Reports show your company name instead.</p>
        )}
        <input
          id="logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            setPreview(url);
            void imagePalette(url).then((colors) => apply(colors, true));
          }}
          className="block w-full min-h-11 file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-link/12 file:px-4 file:font-semibold file:text-link"
        />
        <p className="text-[0.9375rem] text-text-muted">
          PNG, JPEG, or SVG, under 2 MB. A wide logo works best.
        </p>
        <FieldError name="logo" />
      </div>
      <ColorField
        name="brand_primary"
        label="Main color"
        value={main}
        onChange={(v) => {
          setMain(v);
          setPicked(false);
        }}
        logoColors={palette}
        note={picked ? "Color picked from your logo." : undefined}
      />
      <ColorField
        name="brand_secondary"
        label="Accent color"
        defaultValue={secondary}
        logoColors={palette}
        optional
      />
    </>
  );
}

function SwatchRow({
  label,
  quiet = false,
  children,
}: {
  label: string;
  /** Without a logo the row needs no heading: the label is for screen readers only. */
  quiet?: boolean;
  children: ReactNode;
}) {
  return (
    <div role="group" aria-label={label}>
      {quiet ? null : <p className="text-[0.8125rem] text-text-muted">{label}</p>}
      <div className="-mx-1.5 flex flex-wrap items-center">{children}</div>
    </div>
  );
}

/** A logo's colors, read from its pixels on a small canvas. None when it can't be read. */
async function imagePalette(src: string): Promise<string[]> {
  try {
    const img = new Image();
    if (!src.startsWith("blob:")) img.crossOrigin = "anonymous";
    img.src = src;
    await img.decode();
    const w = img.naturalWidth || 96;
    const h = img.naturalHeight || 96;
    const scale = Math.min(1, 96 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return logoPalette(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  } catch {
    return [];
  }
}

/**
 * A color: a swatch that opens the system color picker, the hex small beside it for people who
 * know it, and a row of swatches (the logo's colors first). Below, how a document header reads
 * on it; documents switch to dark text on a light color by themselves (textOnBrand).
 */
export function ColorField({
  name,
  label,
  defaultValue = null,
  value: controlled,
  onChange,
  logoColors = [],
  note,
  optional = false,
  id = name,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  value?: string;
  onChange?: (value: string) => void;
  logoColors?: string[];
  note?: string;
  optional?: boolean;
  /** Unique per page when several forms share a field name (M11 review C3). */
  id?: string;
}) {
  const [own, setOwn] = useState(defaultValue ?? "");
  const value = controlled ?? own;
  // A value set from outside (the logo's color) tells the Save bar, which listens for typing.
  const input = useRef<HTMLInputElement>(null);
  const shown = useRef(value);
  useEffect(() => {
    if (shown.current === value) return;
    shown.current = value;
    input.current?.dispatchEvent(new Event(FIELD_SET, { bubbles: true }));
  }, [value]);
  const set = (v: string) => (onChange ? onChange(v) : setOwn(v));
  const error = useFieldError(name);
  const valid = isHexColor(value);
  const upper = value.toUpperCase();
  const logo = [...new Set(logoColors.map((c) => c.toUpperCase()))];
  const others = brandColorChoices([], valid ? value : null).filter((c) => !logo.includes(c));
  const onColor = valid ? textOnBrand(value, NAVY, WHITE) : WHITE;
  const swatch = (c: string, title: string) => (
    <button
      key={c || "none"}
      type="button"
      onClick={() => set(c)}
      aria-label={title}
      aria-pressed={upper === c}
      title={title}
      className="grid size-11 shrink-0 place-items-center rounded-full"
    >
      <span
        className={cx(
          "size-8 rounded-full border border-control-border",
          upper === c && "ring-2 ring-link ring-offset-2 ring-offset-surface",
        )}
        style={c ? { backgroundColor: c } : undefined}
      >
        {c ? null : (
          <span className="block h-full w-full rounded-full bg-[linear-gradient(135deg,transparent_45%,var(--color-text-muted)_45%,var(--color-text-muted)_55%,transparent_55%)]" />
        )}
      </span>
    </button>
  );
  return (
    <div className={cx("space-y-2", GROUP_ROW, "max-sm:py-2.5")}>
      <div className="flex items-center gap-3">
        <span className="flex-1 sm:font-medium">
          {label}
          {optional ? <span className="text-text-muted sm:font-normal"> (optional)</span> : null}
        </span>
        <input
          ref={input}
          id={id}
          name={name}
          value={value}
          onChange={(e) => set(e.target.value.trim())}
          placeholder={optional ? "None" : NAVY}
          aria-label={`${label} hex code`}
          aria-invalid={error ? true : undefined}
          spellCheck={false}
          className="min-h-11 w-[5.5rem] rounded-lg bg-transparent px-1 text-right font-mono text-[0.9375rem] uppercase text-text-muted placeholder:normal-case focus:bg-surface focus:text-text"
        />
        <label
          className="relative grid size-11 shrink-0 cursor-pointer place-items-center rounded-full"
          title={`Choose ${label.toLowerCase()}`}
        >
          <span
            className="size-9 rounded-full border border-control-border shadow-sm"
            style={{ backgroundColor: valid ? value : "transparent" }}
          />
          <input
            type="color"
            aria-label={`Choose ${label.toLowerCase()}`}
            value={valid ? value.toLowerCase() : NAVY.toLowerCase()}
            onChange={(e) => set(e.target.value.toUpperCase())}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
      </div>
      {logo.length ? (
        <SwatchRow label="From your logo">
          {logo.map((c) => swatch(c, `${c}, from your logo`))}
        </SwatchRow>
      ) : null}
      <SwatchRow label={logo.length ? "More colors" : `${label} swatches`} quiet={!logo.length}>
        {optional ? swatch("", "None") : null}
        {others.map((c) => swatch(c, c))}
      </SwatchRow>
      {note ? <p className="text-[0.9375rem] text-text-muted">{note}</p> : null}
      {valid && name === "brand_primary" ? (
        <div className="flex flex-wrap items-center gap-2 text-[0.9375rem]">
          <span
            className="rounded-full px-3 py-1.5 font-semibold"
            style={{ backgroundColor: value, color: onColor }}
          >
            Report header
          </span>
          {onColor === NAVY ? (
            <span className="text-text-muted">A light color: documents use dark text on it.</span>
          ) : null}
        </div>
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
/** Typed fields; dates and times draw their own value. */
const TYPED = new Set([undefined, "text", "tel", "email", "url", "number", "password", "search"]);

export function SField({ stacked, ...props }: Parameters<typeof Field>[0] & { stacked?: boolean }) {
  const error = useFieldError(String(props.name));
  if (use(InGroup)) {
    // A grouped row's field has no outline, so an empty one needs a placeholder to show where
    // to type: "Required" or "Optional" when none is given, as in iOS Settings.
    const placeholder =
      props.placeholder ??
      (TYPED.has(props.type) ? (props.required ? "Required" : "Optional") : undefined);
    return <GroupedField {...props} placeholder={placeholder} stacked={stacked} error={error} />;
  }
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
