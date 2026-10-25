import { describe, expect, it } from "vitest";
import { REPORT_PHOTO_TEXT, reportPhotoBlock, reportPhotoHint, requiresReportPhoto } from "../src";

describe("Require a Photo", () => {
  it("is off unless the shop turned it on", () => {
    expect(requiresReportPhoto(null)).toBe(false);
    expect(requiresReportPhoto({})).toBe(false);
    expect(requiresReportPhoto({ require_report_photo: "true" })).toBe(false);
    expect(requiresReportPhoto({ require_report_photo: true })).toBe(true);
    // The Complete Job photo rule is its own switch.
    expect(requiresReportPhoto({ require_finish_photo: true })).toBe(false);
  });

  it("blocks a visit with no photo", () => {
    const on = { require_report_photo: true };
    expect(reportPhotoBlock(on, 0)).toBe("Add a photo to send this report.");
    expect(reportPhotoBlock(on, 1)).toBeNull();
    expect(reportPhotoBlock({}, 0)).toBeNull();
  });

  it("explains itself for the shop's visit reports", () => {
    expect(reportPhotoHint("manual")).toBe(REPORT_PHOTO_TEXT.each);
    expect(reportPhotoHint("auto")).toBe(REPORT_PHOTO_TEXT.each);
    expect(reportPhotoHint("monthly")).toBe(REPORT_PHOTO_TEXT.monthly);
    expect(reportPhotoHint("off")).toBeNull();
  });
});
