import {
  REPORT_PHOTO_TEXT,
  reportPhotoBlock,
  reportPhotoHint,
  requiresReportPhoto,
  type VisitReportMode,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// report-photo.ts (owner, 2026-10-25): Require a Photo to send a visit's report.

const settings = [
  null,
  {},
  { require_report_photo: true },
  { require_report_photo: false },
  { require_report_photo: "true" },
  { require_report_photo: 1 },
  { require_finish_photo: true },
];

export const reportPhoto: ModuleCases = {
  requiresReportPhoto: rule(
    (s: unknown) => requiresReportPhoto(s),
    settings.map((s) => [s]),
  ),
  REPORT_PHOTO_TEXT: rule(() => REPORT_PHOTO_TEXT, [[]]),
  reportPhotoHint: rule(
    (mode: VisitReportMode) => reportPhotoHint(mode),
    (["auto", "manual", "monthly", "off"] as VisitReportMode[]).map((m) => [m]),
  ),
  reportPhotoBlock: rule(
    (s: unknown, photos: number) => reportPhotoBlock(s, photos),
    settings.flatMap((s) => [
      [s, 0],
      [s, 2],
    ]),
  ),
};
