import { describe, expect, it } from "vitest";
import {
  issueActions,
  issueConversion,
  issueDescriptionError,
  issueDetailLine,
  issueList,
  issueMediaOf,
  issueTitle,
  issueWorkOptions,
  issuesSegmentLabel,
  openIssueCount,
  reopenIssueWrite,
  reportIssueRow,
  resolveIssueWrite,
} from "./service-issues";
import { issueNotification, NOTIFICATION_KINDS } from "./notifications";

const issue = {
  id: "i1",
  customer_id: "c1",
  property_id: "p1",
  job_id: "visit",
  description: "  Cracked skimmer throat\nLeaks when the pump runs  ",
};

describe("reporting", () => {
  it("needs a description that fits", () => {
    expect(issueDescriptionError("  ")).toBe("Say what’s wrong.");
    expect(issueDescriptionError("x".repeat(2001))).toBe("Keep it under 2,000 characters.");
    expect(issueDescriptionError("Pump leaking")).toBeNull();
  });

  it("writes the visit's customer and pool, trimmed", () => {
    expect(
      reportIssueRow({
        customerId: "c1",
        propertyId: "p1",
        jobId: "visit",
        description: " Pump leaking ",
        suggested: "repair",
        now: "2026-11-16T15:00:00Z",
      }),
    ).toEqual({
      customer_id: "c1",
      property_id: "p1",
      job_id: "visit",
      description: "Pump leaking",
      suggested_type: "repair",
      reported_at: "2026-11-16T15:00:00Z",
    });
  });

  it("offers Leak Detection only where the shop does it", () => {
    expect(issueWorkOptions("pool").map((o) => o.label)).toEqual(["Not Sure", "Repair"]);
    expect(issueWorkOptions("both").map((o) => o.label)).toEqual([
      "Not Sure",
      "Repair",
      "Leak Detection",
    ]);
  });
});

describe("the office's actions", () => {
  it("are for owners and admins", () => {
    expect(issueActions({ status: "open" }, "tech", "both")).toEqual([]);
    expect(issueActions({ status: "open" }, "admin", "both")).toEqual([
      "make_quote",
      "make_detection",
      "resolve",
    ]);
    expect(issueActions({ status: "open" }, "owner", "pool")).toEqual(["make_quote", "resolve"]);
    expect(issueActions({ status: "resolved" }, "owner", "both")).toEqual(["reopen"]);
    // Anyone can open the job an issue became.
    expect(issueActions({ status: "converted" }, "tech", "both")).toEqual(["open_job"]);
  });

  it("resolve with a note, and reopen", () => {
    expect(resolveIssueWrite("u1", "  ", "2026-11-16T16:00:00Z")).toEqual({
      status: "resolved",
      resolution_note: null,
      resolved_by: "u1",
      resolved_at: "2026-11-16T16:00:00Z",
    });
    expect(resolveIssueWrite("u1", " Fixed on the visit ", "t").resolution_note).toBe(
      "Fixed on the visit",
    );
    expect(reopenIssueWrite()).toEqual({
      status: "open",
      resolution_note: null,
      resolved_by: null,
      resolved_at: null,
    });
  });
});

describe("making a job", () => {
  const media = [
    {
      id: "m2",
      job_id: "visit",
      service_issue_id: "i1",
      kind: "video",
      storage_path: "co/visit/m2.mp4",
      upload_state: "pending",
      captured_at: "2026-11-16T15:02:00Z",
      duration_ms: 9000,
    },
    {
      id: "m1",
      job_id: "visit",
      service_issue_id: "i1",
      kind: "photo",
      storage_path: "co/visit/m1.jpg",
      upload_state: "uploaded",
      captured_at: "2026-11-16T15:01:00Z",
      sha256: "a".repeat(64),
      markup: { version: 1, shapes: [] },
    },
    // Another issue's, a removed one, and a copy already on another job: not copied.
    { id: "m3", job_id: "visit", service_issue_id: "i2", kind: "photo" },
    { id: "m4", job_id: "visit", service_issue_id: "i1", kind: "photo", deleted_at: "t" },
    { id: "m5", job_id: "old", service_issue_id: "i1", kind: "photo" },
  ];

  it("writes a job for the pool, converts the issue, and copies its photos", () => {
    let n = 0;
    const made = issueConversion({
      issue,
      media,
      type: "repair",
      jobId: "job2",
      userId: "owner",
      now: "2026-11-16T17:00:00Z",
      newId: () => `copy${++n}`,
    });
    expect(made.job).toEqual({
      type: "repair",
      property_id: "p1",
      bill_to_customer_id: "c1",
      status: "unscheduled",
      summary_notes: "Cracked skimmer throat\nLeaks when the pump runs",
    });
    expect(made.issue).toEqual({
      status: "converted",
      converted_job_id: "job2",
      resolved_by: "owner",
      resolved_at: "2026-11-16T17:00:00Z",
    });
    expect(made.media.map((m) => [m.id, m.job_id, m.service_issue_id, m.storage_path])).toEqual([
      ["copy1", "job2", "i1", "co/visit/m1.jpg"],
      ["copy2", "job2", "i1", "co/visit/m2.mp4"],
    ]);
    expect(made.media[0]).toMatchObject({
      kind: "photo",
      upload_state: "uploaded",
      sha256: "a".repeat(64),
      markup: { version: 1, shapes: [] },
      caption: null,
    });
    expect(made.media[1]).toMatchObject({
      kind: "video",
      upload_state: "pending",
      duration_ms: 9000,
    });
  });

  it("finds an issue's own photos", () => {
    expect(issueMediaOf(media, issue).map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});

describe("the Issues list", () => {
  const rows = [
    { id: "a", status: "open" as const, reported_by: "tech", reported_at: "2026-11-14T10:00:00Z" },
    {
      id: "b",
      status: "resolved" as const,
      reported_by: "tech",
      reported_at: "2026-11-15T10:00:00Z",
    },
    { id: "c", status: "open" as const, reported_by: "other", reported_at: "2026-11-16T10:00:00Z" },
    {
      id: "d",
      status: "converted" as const,
      reported_by: "other",
      reported_at: "2026-11-13T10:00:00Z",
    },
    {
      id: "e",
      status: "open" as const,
      reported_by: "other",
      reported_at: "2026-11-16T11:00:00Z",
      deleted_at: "t",
    },
  ];
  const owner = { userId: "o", role: "owner" };
  const tech = { userId: "tech", role: "tech" };

  it("filters, newest first; techs see their own", () => {
    expect(issueList(rows, "open", owner).map((i) => i.id)).toEqual(["c", "a"]);
    expect(issueList(rows, "resolved", owner).map((i) => i.id)).toEqual(["b", "d"]);
    expect(issueList(rows, "all", tech).map((i) => i.id)).toEqual(["b", "a"]);
    expect(openIssueCount(rows, owner)).toBe(2);
    expect(openIssueCount(rows, tech)).toBe(1);
  });

  it("labels", () => {
    expect(issuesSegmentLabel(0)).toBe("Issues");
    expect(issuesSegmentLabel(3)).toBe("Issues (3)");
    expect(issueDetailLine({ suggested: "detection", reporter: "Sam", reportedOn: "Nov 16" })).toBe(
      "Leak Detection · Sam · Nov 16",
    );
    expect(issueDetailLine({ suggested: null, reporter: null, reportedOn: "Nov 16" })).toBe(
      "Nov 16",
    );
    expect(issueTitle("  Pump\nmore")).toBe("Pump");
    expect(issueTitle("x".repeat(100), 10)).toBe("xxxxxxxxx…");
  });
});

describe("the notification", () => {
  it("goes to the owners and admins, who can turn it off", () => {
    expect(NOTIFICATION_KINDS.some((k) => k.key === "issue")).toBe(true);
    expect(issueNotification("Rebecca Soto", " Cracked\n skimmer ")).toEqual({
      title: "Issue reported",
      body: "Rebecca Soto: Cracked skimmer",
    });
  });
});
