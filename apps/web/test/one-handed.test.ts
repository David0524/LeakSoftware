import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosave, createUndoTimer, type AutosaveStatus } from "../src/lib/autosave";
import { completeSendPrompt, nextStepButtons, type NextStepState } from "../src/lib/next-step";

// One-handed use (owner, 2026-10-20): docs/design/2026-10-20-one-handed-use.md.

const base: NextStepState = {
  section: "details",
  status: "in_progress",
  jobType: "detection",
  hasTestTypes: true,
  canWriteDraft: false,
};

describe("nextStepButtons (item 1)", () => {
  it("offers Start Job on a job that can be started, whatever the section", () => {
    for (const status of ["scheduled", "unscheduled"] as const)
      for (const section of ["details", "checklist", "findings", "photos", "wrap-up"])
        expect(nextStepButtons({ ...base, status, section })).toEqual(["start"]);
  });

  it("offers Complete Job on a maintenance visit's checklist that can be completed", () => {
    const visit = { ...base, jobType: "maintenance", section: "checklist" };
    expect(nextStepButtons(visit)).toEqual(["complete"]);
    expect(nextStepButtons({ ...visit, status: "done" })).toEqual([]);
    // A leak detection job has no Complete Job.
    expect(nextStepButtons({ ...visit, jobType: "detection" })).toEqual([]);
    // A scheduled visit is started first (first match wins).
    expect(nextStepButtons({ ...visit, status: "scheduled" })).toEqual(["start"]);
  });

  it("offers Add Test and Add Finding on Findings, Add Photo and Add Video on Photos", () => {
    expect(nextStepButtons({ ...base, section: "findings" })).toEqual(["add-test", "add-finding"]);
    expect(nextStepButtons({ ...base, section: "findings", hasTestTypes: false })).toEqual([
      "add-finding",
    ]);
    expect(nextStepButtons({ ...base, section: "photos" })).toEqual(["add-photo", "add-video"]);
  });

  it("offers Write Draft on Wrap-Up only while there is no draft", () => {
    expect(nextStepButtons({ ...base, section: "wrap-up", canWriteDraft: true })).toEqual([
      "write-draft",
    ]);
    expect(nextStepButtons({ ...base, section: "wrap-up" })).toEqual([]);
  });

  it("hides the bar when there is nothing to offer", () => {
    expect(nextStepButtons(base)).toEqual([]);
    expect(nextStepButtons({ ...base, section: "checklist" })).toEqual([]);
    expect(nextStepButtons({ ...base, status: "canceled", section: "photos" })).toEqual([
      "add-photo",
      "add-video",
    ]);
  });
});

describe("createAutosave (item 4)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves one second after typing stops, once, with the latest text", async () => {
    const save = vi.fn(async () => null);
    const statuses: AutosaveStatus[] = [];
    const a = createAutosave({ initial: "", save, onStatus: (s) => statuses.push(s) });
    a.change("U");
    await vi.advanceTimersByTimeAsync(500);
    a.change("Under");
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledExactlyOnceWith("Under");
    expect(statuses).toEqual(["saving", "saved"]);
  });

  it("saves at once on flush (the field was left), and not again for the same text", async () => {
    const save = vi.fn(async () => null);
    const a = createAutosave({ initial: "Deck", save });
    a.change("Deck");
    await a.flush();
    expect(save).not.toHaveBeenCalled();
    a.change("Deck drain");
    await a.flush();
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledExactlyOnceWith("Deck drain");
  });

  it("reports a failed save and tries again on the next change", async () => {
    const save = vi.fn(async (v: string) => (v === "bad" ? "No signal." : null));
    const statuses: AutosaveStatus[] = [];
    const a = createAutosave({ initial: "", save, onStatus: (s) => statuses.push(s) });
    a.change("bad");
    await a.flush();
    expect(statuses.at(-1)).toEqual({ error: "No signal." });
    a.change("good");
    await a.flush();
    expect(statuses.at(-1)).toBe("saved");
  });
  it("never saves old text over a draft written again (pause, then reset)", async () => {
    let finish: (() => void) | null = null;
    const save = vi.fn(
      (v: string) =>
        new Promise<null>((resolve) => {
          finish = () => resolve(null);
          void v;
        }),
    );
    const statuses: AutosaveStatus[] = [];
    const a = createAutosave({ initial: "old", save, onStatus: (s) => statuses.push(s) });
    // Typed, then Write the Draft Again before the second has passed: dropped.
    a.change("old, edited");
    a.pause();
    await vi.advanceTimersByTimeAsync(2000);
    a.change("typed while writing");
    await a.flush();
    expect(save).not.toHaveBeenCalled();
    // The new draft is on screen: saving picks up from its text.
    a.reset("new draft");
    a.change("new draft");
    await a.flush();
    expect(save).not.toHaveBeenCalled();
    a.change("new draft, edited");
    const saving = a.flush();
    // Paused again while that save is in flight: it doesn't become the baseline.
    a.pause();
    finish!();
    await saving;
    expect(statuses.at(-1)).toBe("idle");
    a.reset();
    a.change("new draft, edited");
    void a.flush();
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe("createUndoTimer (item 5, Mark Remaining)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("closes after five seconds without Undo", () => {
    const changes: boolean[] = [];
    const send = vi.fn();
    const t = createUndoTimer((open) => changes.push(open));
    t.start(send);
    expect(t.open).toBe(true);
    vi.advanceTimersByTime(4999);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledOnce();
    expect(t.open).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it("drops it on Undo", () => {
    const send = vi.fn();
    const t = createUndoTimer(() => {});
    t.start(send);
    t.cancel();
    vi.advanceTimersByTime(10_000);
    expect(send).not.toHaveBeenCalled();
    expect(t.open).toBe(false);
  });

  it("closes at once when the screen is left sooner, running what waits only once", () => {
    const send = vi.fn();
    const t = createUndoTimer(() => {});
    t.start(send);
    t.flush();
    vi.advanceTimersByTime(10_000);
    t.flush();
    expect(send).toHaveBeenCalledOnce();
  });
});

describe("completeSendPrompt (item 5)", () => {
  it("asks before completing a visit when the shop sends visit reports automatically", () => {
    expect(
      completeSendPrompt({ jobType: "maintenance", reportMode: "auto", customer: "Sam Sample" }),
    ).toEqual({
      title: "Ready to send the visit report?",
      message: "Completing this visit sends its report to Sam Sample.",
      confirmLabel: "Complete and Send",
    });
    expect(
      completeSendPrompt({ jobType: "maintenance", reportMode: "auto", customer: " " })?.message,
    ).toBe("Completing this visit sends its report to the customer.");
  });

  it("stays one tap when completing sends nothing", () => {
    for (const reportMode of ["manual", "off"])
      expect(
        completeSendPrompt({ jobType: "maintenance", reportMode, customer: "Sam" }),
      ).toBeNull();
    for (const jobType of ["detection", "repair"])
      expect(completeSendPrompt({ jobType, reportMode: "auto", customer: "Sam" })).toBeNull();
  });
});
