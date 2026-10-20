import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { swipeDirection } from "../src/ui/swipeRule";
import { createAutosave } from "../src/lib/autosave";
import { createUndoWindow } from "../src/lib/undo";
import { nextStepButtons, type NextStepState } from "../src/lib/nextStep";
import {
  addRequest,
  parseRequests,
  removeRequest,
  type ReportRequest,
} from "../src/lib/reportRequests";

// One-handed use (owner, 2026-10-20; docs/design/2026-10-20-one-handed-use.md).

describe("section swipe rule (item 7)", () => {
  it("needs 70 pt sideways", () => {
    expect(swipeDirection(-69, 0)).toBeNull();
    expect(swipeDirection(-70, 0)).toBe("next");
    expect(swipeDirection(90, 10)).toBe("previous");
  });
  it("needs sideways at least 1.8 times the vertical", () => {
    expect(swipeDirection(-90, 50)).toBe("next");
    expect(swipeDirection(-90, 51)).toBeNull();
    expect(swipeDirection(100, -60)).toBeNull();
  });
});

describe("autosave (item 4)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves one second after typing stops", () => {
    const save = vi.fn();
    const auto = createAutosave({ initial: "", save });
    auto.change("a");
    vi.advanceTimersByTime(900);
    auto.change("ab");
    vi.advanceTimersByTime(999);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledWith("ab");
  });
  it("saves at once when the field is left, and not the same text twice", () => {
    const save = vi.fn();
    const auto = createAutosave({ initial: "x", save });
    auto.change("y");
    expect(auto.flush()).toBe(true);
    auto.change("y");
    expect(auto.flush()).toBe(false);
    auto.change("x");
    vi.advanceTimersByTime(1000);
    expect(save.mock.calls).toEqual([["y"], ["x"]]);
  });
  it("cancel drops what was waiting", () => {
    const save = vi.fn();
    const auto = createAutosave({ initial: "", save });
    auto.change("z");
    auto.cancel();
    vi.advanceTimersByTime(2000);
    expect(auto.flush()).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("Mark Remaining's Undo window (item 5)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is open for five seconds", () => {
    const changes: boolean[] = [];
    const win = createUndoWindow((open) => changes.push(open));
    win.start();
    expect(win.open).toBe(true);
    vi.advanceTimersByTime(4999);
    expect(win.open).toBe(true);
    vi.advanceTimersByTime(1);
    expect(win.open).toBe(false);
    expect(changes).toEqual([true, false]);
  });
  it("closes at once on Undo, and a new mark restarts it", () => {
    const win = createUndoWindow(() => {});
    win.start();
    vi.advanceTimersByTime(4000);
    win.start();
    vi.advanceTimersByTime(4000);
    expect(win.open).toBe(true);
    win.close();
    expect(win.open).toBe(false);
  });
});

describe("Next Step bar (item 1)", () => {
  const base: NextStepState = {
    section: "details",
    status: "in_progress",
    jobType: "detection",
    hasTestTypes: true,
    noDraft: true,
    canWriteDraft: true,
  };
  it("offers Start Job first on a job that can be started", () => {
    expect(nextStepButtons({ ...base, status: "scheduled", section: "findings" })).toEqual([
      "start",
    ]);
    expect(nextStepButtons({ ...base, status: "unscheduled" })).toEqual(["start"]);
  });
  it("Complete Job on a visit's checklist", () => {
    expect(nextStepButtons({ ...base, jobType: "maintenance", section: "checklist" })).toEqual([
      "complete",
    ]);
    expect(nextStepButtons({ ...base, section: "checklist" })).toEqual([]);
  });
  it("Findings, Photos and Wrap-Up", () => {
    expect(nextStepButtons({ ...base, section: "findings" })).toEqual(["add-test", "add-finding"]);
    expect(nextStepButtons({ ...base, section: "findings", hasTestTypes: false })).toEqual([
      "add-finding",
    ]);
    expect(nextStepButtons({ ...base, section: "photos" })).toEqual(["add-photo", "add-video"]);
    expect(nextStepButtons({ ...base, section: "wrapup" })).toEqual(["write-draft"]);
    expect(nextStepButtons({ ...base, section: "wrapup", canWriteDraft: false })).toEqual([
      "review",
    ]);
    expect(nextStepButtons({ ...base, section: "wrapup", noDraft: false })).toEqual([]);
    expect(nextStepButtons(base)).toEqual([]);
  });
});

describe("report requests made offline (item 6)", () => {
  const email: ReportRequest = { kind: "email", reportId: "r1", jobId: "j1", to: "a@b.co" };
  it("keeps one of each request per report, the latest", () => {
    let q = addRequest([], email);
    q = addRequest(q, { ...email, to: "c@d.co" });
    q = addRequest(q, { kind: "finish", reportId: "r1", jobId: "j1", to: null });
    expect(q).toEqual([
      { ...email, to: "c@d.co" },
      { kind: "finish", reportId: "r1", jobId: "j1", to: null },
    ]);
    expect(removeRequest(q, email)).toEqual([
      { kind: "finish", reportId: "r1", jobId: "j1", to: null },
    ]);
  });
  it("reads a stored queue defensively", () => {
    expect(parseRequests(null)).toEqual([]);
    expect(parseRequests("not json")).toEqual([]);
    expect(parseRequests(JSON.stringify([email, { kind: "fax" }, 3]))).toEqual([email]);
  });
});
