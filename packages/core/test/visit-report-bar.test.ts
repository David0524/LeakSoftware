import { describe, expect, it } from "vitest";
import { visitReportBar } from "../src";

const now = new Date("2026-10-22T20:00:00Z");
const bar = (o: Partial<Parameters<typeof visitReportBar>[0]>) =>
  visitReportBar({
    jobType: "maintenance",
    status: "done",
    mode: "manual",
    sentAt: null,
    now,
    timeZone: "America/Los_Angeles",
    ...o,
  });

describe("visitReportBar", () => {
  it("offers Send Visit Report on a done visit in a Manual shop", () => {
    expect(bar({})).toEqual({ line: "Ready to send", action: "send", label: "Send Visit Report" });
    // Monthly shops: it goes with the month's invoice, and can still be sent now.
    expect(bar({ mode: "monthly" })).toEqual({
      line: "Goes with the monthly invoice",
      action: "send",
      label: "Send Visit Report",
    });
    expect(bar({ mode: "monthly", status: "in_progress" })).toBeNull();
  });

  it("offers View Report once it's sent, with the time", () => {
    expect(bar({ sentAt: "2026-10-22T21:14:00Z" })).toEqual({
      line: "Visit report sent · 2:14 PM",
      action: "view",
      label: "View Report",
    });
    expect(bar({ sentAt: "2026-10-20T21:14:00Z" })?.line).toBe(
      "Visit report sent · Tue, Oct 20, 2:14 PM",
    );
  });

  it("says an Automatic shop's report sends by itself before the visit is done", () => {
    expect(bar({ mode: "auto", status: "in_progress" })).toEqual({
      line: "Sends by itself when you finish",
      action: null,
      label: null,
    });
    expect(bar({ mode: "auto" })).toEqual({
      line: "Not sent yet",
      action: "send",
      label: "Send Visit Report",
    });
  });

  it("says nothing off maintenance, with reports off, canceled, or Manual before done", () => {
    expect(bar({ jobType: "detection" })).toBeNull();
    expect(bar({ mode: "off" })).toBeNull();
    expect(bar({ status: "canceled" })).toBeNull();
    expect(bar({ status: "in_progress" })).toBeNull();
  });
});

describe("visitReportBar with Require a Photo", () => {
  it("offers Add Photo on a done visit with no photo", () => {
    expect(bar({ needsPhoto: true })).toEqual({
      line: "Needs a photo to send",
      action: "photo",
      label: "Add Photo",
    });
    expect(bar({ needsPhoto: true, mode: "auto" })).toEqual({
      line: "Sends once it has a photo",
      action: "photo",
      label: "Add Photo",
    });
    expect(bar({ needsPhoto: true, mode: "monthly" })?.line).toBe("Goes with the monthly invoice");
  });

  it("doesn't change a sent report, an unfinished visit, or reports turned off", () => {
    expect(bar({ needsPhoto: true, sentAt: "2026-10-22T21:14:00Z" })?.action).toBe("view");
    expect(bar({ needsPhoto: true, status: "in_progress", mode: "auto" })?.action).toBeNull();
    expect(bar({ needsPhoto: true, mode: "off" })).toBeNull();
  });
});
