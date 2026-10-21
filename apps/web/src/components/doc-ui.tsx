import type { ReactNode } from "react";
import { Notice, cx } from "./ui";

// Building blocks for the customer's quote, invoice, and report pages. On screen they follow
// iOS (owner, 2026-10-14). The PDF is the same page printed with ?print=1 and must not change
// at all (owner: "Don't change the PDF at all"), so every screen-only look is either phone-only
// (max-sm:, the PDF is wider than sm) or switched off by the print flag.

type Tone = "info" | "warning" | "error" | "success";

const TINT: Record<Tone, string> = {
  info: "bg-status-info/12",
  warning: "bg-status-warning/15",
  error: "bg-status-fail/12",
  success: "bg-status-pass/12",
};

/** An iOS inline banner: rounded and tinted, no side bar. Printed, the PDF keeps its Notice. */
export function Banner({
  tone = "info",
  print = false,
  children,
}: {
  tone?: Tone;
  print?: boolean;
  children: ReactNode;
}) {
  if (print) return <Notice tone={tone}>{children}</Notice>;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("rounded-2xl px-4 py-3", TINT[tone])}
    >
      {children}
    </div>
  );
}

/**
 * The Accept or Pay card under a quote or invoice. On screen it is an iOS grouped form: flat on
 * the phone's gray page, a gray inset block on wider screens. Printed, the old outlined box.
 */
export function actionCardClass(print: boolean) {
  return print
    ? "mt-8 rounded-lg border border-neutral-200 p-4 sm:p-6"
    : "mt-8 sm:rounded-2xl sm:bg-bg sm:p-6";
}

/** Phones: the customer pages sit on the grouped gray background; the PDF stays on paper. */
// Long unbroken text (a pasted link, a mistyped line) wraps instead of widening the page.
export const DOC_PAGE =
  "lb-light min-h-full flex-1 bg-paper text-text max-sm:bg-bg [overflow-wrap:anywhere]";

/** Phones: a list (dl, ul) as one iOS inset grouped block. Wider (and printed), unchanged. */
export const PHONE_GROUP = "max-sm:overflow-hidden max-sm:rounded-xl max-sm:bg-surface max-sm:pl-4";

/** Phones: one row of a PHONE_GROUP, with a hairline above it that starts where the text does. */
export const PHONE_ROW =
  "max-sm:flex max-sm:min-h-11 max-sm:items-center max-sm:justify-between max-sm:gap-4 max-sm:py-2.5 max-sm:pr-4 max-sm:not-first:border-t max-sm:not-first:border-separator";

/** Phones: a section heading drawn as an iOS group header (small, gray, above the group). */
export const PHONE_GROUP_TITLE =
  "max-sm:mb-2 max-sm:border-b-0 max-sm:px-4 max-sm:pb-0 max-sm:font-sans max-sm:text-[0.8125rem] max-sm:font-normal max-sm:text-text-muted max-sm:uppercase";

/** Phones: a block of content (notes, a report section) on a white card. */
export const PHONE_CARD = "max-sm:rounded-2xl max-sm:bg-surface max-sm:p-4";

/** Phones: a detail's label (Billed to, Property) on the left of its row, in body text. */
export const PHONE_LABEL = "max-sm:shrink-0 max-sm:text-text";

/** Phones: a detail's value on the right of its row, in secondary gray. */
export const PHONE_VALUE =
  "max-sm:mb-0 max-sm:min-w-0 max-sm:text-right max-sm:font-normal max-sm:text-text-muted";
