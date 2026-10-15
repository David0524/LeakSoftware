import { Platform, type TextStyle } from "react-native";
import { tokens, fieldTheme } from "@leakbook/tokens";
import type { InvoiceStatus, JobStatus, QuoteStatus } from "@leakbook/core";

/** iOS follows Apple's conventions (owner, 2026-10-14); Android keeps its own. */
export const ios = Platform.OS === "ios";

export const color = {
  ...fieldTheme,
  navy: tokens.color.brand.navy,
  water: tokens.color.brand.water,
  safety: tokens.color.brand.safety,
  pass: tokens.color.status.pass,
  fail: tokens.color.status.fail,
  excluded: tokens.color.status.excluded,
  warning: tokens.color.status.warning,
  info: tokens.color.status.info,
  neutral100: tokens.color.neutral["100"],
  neutral200: tokens.color.neutral["200"],
  /** Outlines of fields and choices: 5.7:1 on white, visible in direct sun. */
  controlBorder: tokens.color.neutral["500"],
} as const;

/** Photo markup colors (brand/tokens.json color.markup). */
export const markupColor = tokens.color.markup;

/** Font family names registered in src/app/_layout.tsx. */
export const font = {
  displaySemiBold: "Barlow-SemiBold",
  displayBold: "Barlow-Bold",
  displayExtraBold: "Barlow-ExtraBold",
  body: "PublicSans-Regular",
  bodyMedium: "PublicSans-Medium",
  bodySemiBold: "PublicSans-SemiBold",
  bodyBold: "PublicSans-Bold",
} as const;

/**
 * Body text and controls. On iPhone this is the system font (San Francisco), as on the website
 * on Apple devices (owner, 2026-10-14); Barlow stays for titles. Android keeps Public Sans.
 * Spread into a style: `{ ...face.semiBold, fontSize: 15 }`.
 */
export const face: Record<"regular" | "medium" | "semiBold" | "bold", TextStyle> = ios
  ? {
      regular: { fontFamily: "System", fontWeight: "400" },
      medium: { fontFamily: "System", fontWeight: "500" },
      semiBold: { fontFamily: "System", fontWeight: "600" },
      bold: { fontFamily: "System", fontWeight: "700" },
    }
  : {
      regular: { fontFamily: font.body },
      medium: { fontFamily: font.bodyMedium },
      semiBold: { fontFamily: font.bodySemiBold },
      bold: { fontFamily: font.bodyBold },
    };

/**
 * A token color at an opacity, for tinted buttons and pressed rows (a light fill of the text
 * color, like iOS tinted buttons and the website's `bg-link/12`). Takes a #RRGGBB token.
 */
export function tint(hex: string, opacity: number): string {
  const a = Math.round(Math.min(1, Math.max(0, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex.slice(0, 7)}${a}`;
}

/**
 * Navigation bar colors. iPhone: the light iOS bar over the grouped gray page, blue (link)
 * buttons, navy titles. Android: the navy brand app bar with white title and icons.
 */
export const header = {
  background: ios ? color.bg : color.header,
  tint: ios ? color.link : color.onHeader,
  title: ios ? color.text : color.onHeader,
} as const;

export const space = tokens.space;
export const radius = tokens.radius;
export const touch = tokens.touch.minTarget;

export const JOB_STATUS_COLOR: Record<JobStatus, string> = {
  unscheduled: tokens.color.status.excluded,
  scheduled: tokens.color.neutral["700"],
  in_progress: tokens.color.brand.water,
  report_sent: tokens.color.status.info,
  quote_sent: tokens.color.status.info,
  quote_accepted: tokens.color.status.warning,
  invoiced: tokens.color.status.warning,
  paid: tokens.color.status.pass,
  canceled: tokens.color.status.excluded,
  done: tokens.color.status.pass,
};

/** Status pills on the Quote tab. */
export const QUOTE_STATUS_COLOR: Record<QuoteStatus, string> = {
  draft: tokens.color.status.excluded,
  sent: tokens.color.status.info,
  accepted: tokens.color.status.pass,
  declined: tokens.color.status.fail,
  expired: tokens.color.status.excluded,
};

/** Status pills on the invoice. */
export const INVOICE_STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft: tokens.color.status.excluded,
  sent: tokens.color.status.info,
  partially_paid: tokens.color.status.warning,
  paid: tokens.color.status.pass,
  void: tokens.color.status.excluded,
};
