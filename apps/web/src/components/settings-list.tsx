"use client";

import { createContext, use, useCallback, useState, type ReactNode } from "react";
import { Banner } from "./doc-ui";
import { NavPlus } from "./nav-bar";
import { SheetDone } from "./settings-forms";
import { Sheet } from "./sheet";
import { Button, PageHeader } from "./ui";

// Settings pages that hold a list of rows (price book items, components, severities…), as iOS
// draws them: each row in an inset grouped list opens its edit form in a sheet, and "+" in the
// navigation bar opens the same form to add one. Wider screens show the sheet as a centered
// dialog and the add button in the page header.

/** Shows what the last sheet did ("Saved.", "Removed.") once it has closed. */
const Notify = createContext<(message: string) => void>(() => {});

export function SettingsListPage({
  title,
  subtitle,
  add,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  /** The Add button's name (also the sheet's title) and the form it opens. */
  add?: { label: string; form: ReactNode };
  children: ReactNode;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const close = useCallback(() => setAdding(false), []);
  const open = () => {
    setNotice(null);
    setAdding(true);
  };
  const added = useCallback((message: string) => {
    setAdding(false);
    setNotice(message);
  }, []);
  return (
    <Notify value={setNotice}>
      <PageHeader
        back={{ href: "/settings", label: "Settings" }}
        title={title}
        subtitle={subtitle}
        navAction={add ? <NavPlus onClick={open} label={add.label} /> : undefined}
        actions={
          add ? (
            <Button type="button" kind="secondary" onClick={open}>
              {add.label}
            </Button>
          ) : undefined
        }
        // Phones use the "+" in the navigation bar instead.
        actionsClassName="max-sm:hidden"
      />
      <div className="max-w-2xl space-y-6">
        {notice ? <Banner tone="success">{notice}</Banner> : null}
        {children}
      </div>
      {add ? (
        <Sheet open={adding} onClose={close} title={add.label}>
          <SheetDone value={added}>{add.form}</SheetDone>
        </Sheet>
      ) : null}
    </Notify>
  );
}

/**
 * One row of a settings list: the name (and a line of detail) on the left, a key value on the
 * right, and a chevron. Tapping it opens `children` (the edit form) in a sheet titled `title`.
 * Use inside Grouped. Without children the row only shows (nothing to edit).
 */
export function SheetRow({
  label,
  detail,
  value,
  title,
  testId,
  children,
}: {
  label: ReactNode;
  detail?: ReactNode;
  value?: ReactNode;
  /** The sheet's title, usually the item's name. */
  title: string;
  testId?: string;
  children?: ReactNode;
}) {
  const notify = use(Notify);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const done = useCallback(
    (message: string) => {
      setOpen(false);
      notify(message);
    },
    [notify],
  );
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block break-words">{label}</span>
        {detail ? (
          <span className="block text-[0.9375rem] break-words text-text-muted">{detail}</span>
        ) : null}
      </span>
      {value != null ? (
        <span className="flex shrink-0 items-center gap-2 text-right text-text-muted">{value}</span>
      ) : null}
    </>
  );
  const row = "flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left";
  return (
    <li data-testid={testId}>
      {children ? (
        <>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => {
              notify("");
              setOpen(true);
            }}
            className={`${row} transition-colors hover:bg-text/[0.03] focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-focus active:bg-text/[0.06]`}
          >
            {inner}
            <span aria-hidden="true" className="shrink-0 text-xl leading-none text-text-muted/70">
              ›
            </span>
          </button>
          <Sheet open={open} onClose={close} title={title}>
            <SheetDone value={done}>{children}</SheetDone>
          </Sheet>
        </>
      ) : (
        <div className={row}>{inner}</div>
      )}
    </li>
  );
}

/** Remove or Revoke at the bottom of an edit sheet, set apart from Save. */
export function SheetDanger({ children }: { children: ReactNode }) {
  return <div className="mt-6 border-t-[0.5px] border-separator pt-4">{children}</div>;
}
