import { tokens, fieldTheme } from "@leakbook/tokens";
import type { JobStatus } from "@leakbook/core";

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
} as const;

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
};
