import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JOB_STATUSES,
  normalizeTestData,
  parseDollars,
  uuidv7,
  validateTestData,
  type ChecklistItemResult,
  type JobStatus,
  type TestFieldSchema,
} from "@leakbook/core";
import { createAutosave } from "../src/lib/autosave";
import { parseLineQuantity } from "../src/lib/lineQuantity";
import { jobMoves, nextStepButtons, type NextStepState } from "../src/lib/nextStep";
import { createUndoWindow, marksToUndo } from "../src/lib/undo";
import { swipeDirection } from "../src/ui/swipeRule";

// Trying to break the field app's one-handed-use rules and the field loop's inputs.

describe("swipe rule at its edges", () => {
  it("counts exactly 70 pt and exactly 1.8 times, not a hair less", () => {
    expect(swipeDirection(70, 0)).toBe("previous");
    expect(swipeDirection(-69.9, 0)).toBeNull();
    expect(swipeDirection(-90, 50)).toBe("next"); // 90 = 50 × 1.8
    expect(swipeDirection(-90, -50.01)).toBeNull();
    expect(swipeDirection(0, 0)).toBeNull();
    expect(swipeDirection(-0, 0)).toBeNull();
  });
  it("never pages on a missing reading", () => {
    expect(swipeDirection(Number.NaN, 0)).toBeNull();
    expect(swipeDirection(-200, Number.NaN)).toBeNull();
    expect(swipeDirection(Number.POSITIVE_INFINITY, 0)).toBe("previous");
    expect(swipeDirection(-500, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("Next Step bar for every status, type and section", () => {
  const sections = ["details", "checklist", "findings", "photos", "wrapup", "nonsense"];
  const types = ["detection", "repair", "maintenance", "something_new"];
  it("never offers Start Job or Complete Job on a job that can't take it", () => {
    for (const status of JOB_STATUSES)
      for (const jobType of types)
        for (const section of sections) {
          const steps = nextStepButtons({
            section,
            status,
            jobType,
            hasTestTypes: true,
            noDraft: true,
            canWriteDraft: true,
          });
          if (steps.includes("start")) expect(["scheduled", "unscheduled"]).toContain(status);
          if (steps.includes("complete")) {
            expect(jobType).toBe("maintenance");
            expect(["scheduled", "in_progress"]).toContain(status);
            expect(section).toBe("checklist");
          }
          expect(steps.length).toBeLessThanOrEqual(2);
          expect(new Set(steps).size).toBe(steps.length);
        }
  });
  it("a canceled or finished visit offers nothing on its checklist", () => {
    for (const status of ["canceled", "done", "paid"] as const)
      expect(
        nextStepButtons({
          section: "checklist",
          status,
          jobType: "maintenance",
          hasTestTypes: false,
          noDraft: false,
          canWriteDraft: false,
        }),
      ).toEqual([]);
  });
  it("a status this app doesn't know yet doesn't break the job page", () => {
    const state: NextStepState = {
      section: "findings",
      status: "on_hold" as JobStatus,
      jobType: "detection",
      hasTestTypes: true,
      noDraft: true,
      canWriteDraft: true,
    };
    expect(jobMoves("on_hold" as JobStatus, "detection")).toEqual([]);
    expect(nextStepButtons(state)).toEqual(["add-test", "add-finding"]);
    expect(nextStepButtons({ ...state, status: "toString" as JobStatus })).toEqual([
      "add-test",
      "add-finding",
    ]);
  });
});

describe("autosave under pressure", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("rapid typing then leaving saves the last text once", () => {
    const save = vi.fn();
    const auto = createAutosave({ initial: "", save });
    for (const ch of "under the deck 🛠️".split("")) {
      auto.change(ch);
      vi.advanceTimersByTime(300);
    }
    auto.change("under the deck 🛠️");
    expect(auto.flush()).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(save.mock.calls).toEqual([["under the deck 🛠️"]]);
  });
  it("very long text is saved whole", () => {
    const save = vi.fn();
    const auto = createAutosave({ initial: "", save });
    const long = "x".repeat(200_000);
    auto.change(long);
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledWith(long);
  });
  it("text equal to what's on the phone isn't saved", () => {
    const save = vi.fn();
    const auto = createAutosave({ initial: "same", save });
    auto.change("same");
    vi.advanceTimersByTime(1000);
    expect(auto.flush()).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
  it("a save that throws doesn't count as saved, so leaving tries again", () => {
    const save = vi.fn((v: string) => {
      if (save.mock.calls.length === 1) throw new Error(`disk full ${v}`);
    });
    const auto = createAutosave({ initial: "", save });
    auto.change("a");
    expect(() => auto.flush()).toThrow();
    auto.change("a");
    expect(auto.flush()).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
  });
  it("typing the old text again saves after the phone's value changed by other means", () => {
    // Item page: Where "deck" saved, the answer set to Not Leaking clears Where, Leaking again,
    // and the tech types "deck" again.
    const save = vi.fn();
    const auto = createAutosave({ initial: "", save });
    auto.change("deck");
    auto.flush();
    auto.rebase("");
    auto.change("deck");
    expect(auto.flush()).toBe(true);
    expect(save.mock.calls).toEqual([["deck"], ["deck"]]);
  });
});

describe("Mark Remaining's Undo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const ok = { status: "inspected" as const, outcome: "ok" as const };
  it("keeps an item answered again during the window", () => {
    const results = new Map<string, Pick<ChecklistItemResult, "status" | "outcome">>([
      ["a", ok],
      ["b", { status: "inspected" as const, outcome: "leaking" as const }],
      ["c", { status: "excluded" as const, outcome: null }],
      ["d", { status: "pending" as const, outcome: null }],
    ]);
    expect(marksToUndo(["a", "b", "c", "d", "gone"], results)).toEqual(["a"]);
  });
  it("closing twice or after it timed out tells once", () => {
    const changes: boolean[] = [];
    const win = createUndoWindow((o) => changes.push(o));
    win.start();
    win.close();
    win.close();
    vi.advanceTimersByTime(10_000);
    win.start();
    vi.advanceTimersByTime(5000);
    win.close();
    expect(changes).toEqual([true, false, true, false]);
  });
});

describe("readings, quantities and money as typed", () => {
  const schema: TestFieldSchema = {
    fields: [{ key: "psi", label: "Start PSI", type: "number", required: true }],
  } as TestFieldSchema;
  it("a reading must be a plain, finite, non-negative number", () => {
    const err = (v: string) => validateTestData(schema, { psi: v }).psi ?? null;
    expect(err("1,5")).toBe("Enter a number.");
    expect(err("1e309")).toBe("Enter a number.");
    expect(err("abc")).toBe("Enter a number.");
    expect(err("")).toBe("Enter start psi.");
    expect(err(" ")).toBe("Enter start psi.");
    expect(err("-1")).toBe("Can't be negative.");
    expect(err("-0")).toBeNull();
    expect(err(" 12.5 ")).toBeNull();
    expect(normalizeTestData(schema, { psi: " 12.5 " })).toEqual({ psi: 12.5 });
    expect(JSON.stringify(normalizeTestData(schema, { psi: "-0" }))).toBe('{"psi":0}');
  });
  it("a reading must sit within the field's bounds (owner, 2026-10-20)", () => {
    const bounded = {
      fields: [{ ...schema.fields[0]!, unit: "PSI", min: 0, max: 150 }],
    } as TestFieldSchema;
    const err = (v: string) => validateTestData(bounded, { psi: v }).psi ?? null;
    expect(err("1e23")).toBe("Enter start psi between 0 and 150 PSI.");
    expect(err("-1")).toBe("Enter start psi between 0 and 150 PSI.");
    expect(err("150")).toBeNull();
    expect(err("0")).toBeNull();
  });
  it("an invoice quantity is a real number above 0 with at most two decimals", () => {
    expect(parseLineQuantity("")).toBe(1);
    expect(parseLineQuantity("2,5")).toBe(2.5);
    expect(parseLineQuantity("0.01")).toBe(0.01);
    for (const bad of ["1e309", "Infinity", "-1", "0", "-0", "abc", "1.005", "NaN"])
      expect(parseLineQuantity(bad), bad).toBeNull();
  });
  it("money stays whole cents", () => {
    for (const v of ["125", "125.5", "$1,250.99", "0.07", "-0"]) {
      const c = parseDollars(v);
      expect(Number.isInteger(c), v).toBe(true);
    }
    expect(parseDollars("125.5")).toBe(12550);
    expect(parseDollars("1e3")).toBeNull();
    expect(parseDollars("1.999")).toBeNull();
  });
  it("ids are UUIDv7, in time order", () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
  });
});
