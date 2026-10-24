import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTOSAVE_OFFLINE,
  createAutosave,
  createUndoTimer,
  type AutosaveStatus,
} from "../src/lib/autosave";
import { NO_CONNECTION, orOffline, whenOffline } from "../src/lib/offline";
import { parseQuantity } from "../src/lib/quantity";
import { isUuid } from "../src/lib/uuid";
import { completeSendPrompt, nextStepButtons, type NextStepState } from "../src/lib/next-step";

// One-handed use (owner, 2026-10-20): docs/design/2026-10-20-one-handed-use.md.

const base: NextStepState = {
  section: "details",
  status: "in_progress",
  jobType: "detection",
  hasTestTypes: true,
  wrapUpAction: null,
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

  it("offers Wrap-Up's next step until every step is done", () => {
    expect(
      nextStepButtons({ ...base, section: "wrap-up", wrapUpAction: "Review with Customer" }),
    ).toEqual(["wrap-up"]);
    expect(nextStepButtons({ ...base, section: "wrap-up" })).toEqual([]);
    // Only on Wrap-Up.
    expect(nextStepButtons({ ...base, wrapUpAction: "Send Invoice" })).toEqual([]);
  });

  it("offers a done maintenance visit's report on every section", () => {
    const done = { ...base, jobType: "maintenance", status: "done" as const };
    for (const section of ["details", "checklist", "photos"])
      expect(nextStepButtons({ ...done, section, visitAction: "view" })).toEqual(["visit-report"]);
    expect(nextStepButtons({ ...done, section: "checklist", visitAction: "send" })).toEqual([
      "visit-report",
    ]);
    // Before it's done, the checklist keeps Complete Job.
    expect(
      nextStepButtons({ ...done, status: "in_progress", section: "checklist", visitAction: null }),
    ).toEqual(["complete"]);
    // Visit reports off: nothing.
    expect(nextStepButtons({ ...done, section: "details" })).toEqual([]);
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
  it("keeps text that couldn't reach the server and saves it on the next try", async () => {
    let online = false;
    const save = vi.fn(async () => {
      if (!online) throw new TypeError("Failed to fetch");
      return null;
    });
    const statuses: AutosaveStatus[] = [];
    const a = createAutosave({ initial: "", save, onStatus: (s) => statuses.push(s) });
    a.change("Seam at the skimmer");
    await vi.advanceTimersByTimeAsync(1000);
    expect(statuses.at(-1)).toEqual({ error: AUTOSAVE_OFFLINE });
    // Back online: the field is left (or the signal returns) without typing anything new.
    online = true;
    await a.flush();
    expect(save).toHaveBeenLastCalledWith("Seam at the skimmer");
    expect(statuses.at(-1)).toBe("saved");
    await a.flush();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("saves text typed again after the stored value changed from outside", async () => {
    const save = vi.fn(async () => null);
    const a = createAutosave({ initial: "", save });
    a.change("deck");
    await a.flush();
    // An answer change cleared Where on the server; the tech types the same text again.
    a.rebase("");
    a.change("deck");
    await a.flush();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("keeps a trailing space just typed when the saved text comes back trimmed", async () => {
    // The field holds what was typed; the autosave only ever reads it, and the server's
    // trimmed copy coming back (rebase) neither rewrites it nor saves again.
    let field = "deck";
    const save = vi.fn(async () => null);
    const a = createAutosave({ initial: "", save });
    a.change(field.trim());
    await a.flush();
    field += " ";
    a.change(field.trim());
    a.rebase("deck");
    await a.flush();
    expect(field).toBe("deck ");
    expect(save).toHaveBeenCalledExactlyOnceWith("deck");
    field += "drain";
    a.change(field.trim());
    await a.flush();
    expect(save).toHaveBeenLastCalledWith("deck drain");
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

describe("parseQuantity (invoice lines)", () => {
  it("takes 1, 2.5 and 2,5, and blank as 1", () => {
    expect(parseQuantity("1")).toBe(1);
    expect(parseQuantity(" 2.5 ")).toBe(2.5);
    expect(parseQuantity("2,5")).toBe(2.5);
    expect(parseQuantity("")).toBe(1);
  });

  it("refuses what isn't a quantity", () => {
    for (const bad of ["1e309", "Infinity", "1e3", "-1", "0", "abc", "1.234", "100000", "NaN"])
      expect(parseQuantity(bad)).toBeNull();
  });

  it("takes every quantity with two decimals, though most aren't exact in floating point", () => {
    // 1.1 × 100 is 110.00000000000001 and 1.15 × 100 is 114.99999999999999.
    for (const ok of ["1.1", "1.15", "0.07", "2.3", "4.35", "99999.99"])
      expect(parseQuantity(ok), ok).toBe(Number(ok));
    for (let i = 1; i < 10_000; i++) {
      const typed = (i / 100).toFixed(2);
      expect(parseQuantity(typed), typed).toBe(Number(typed));
    }
  });
});

describe("orOffline (no signal)", () => {
  it("answers a connection error where the button is, instead of the error screen", async () => {
    type S = { error?: string };
    const offline: (state: S, form: FormData) => Promise<S> = async () => {
      throw new TypeError("Failed to fetch");
    };
    const action = orOffline(offline);
    expect(await action({}, new FormData())).toEqual({ message: undefined, error: NO_CONNECTION });
  });

  it("leaves answers and other errors as they were", async () => {
    type S = { error?: string; message?: string };
    const saved: (state: S, n: number) => Promise<S> = async () => ({ message: "Saved." });
    const ok = orOffline(saved);
    expect(await ok({}, 1)).toEqual({ message: "Saved." });
    const failing: (state: S, n: number) => Promise<S> = async () => {
      throw new Error("Server Components render failed");
    };
    const broken = orOffline(failing);
    await expect(broken({}, 1)).rejects.toThrow("Server Components render failed");
  });
});

describe("isUuid (job links)", () => {
  it("takes the database's ids and nothing else", () => {
    expect(isUuid("00000000-0000-4000-8000-00000000e001")).toBe(true);
    expect(isUuid("0190A1B2-C3D4-7E5F-8A9B-0123456789AB")).toBe(true);
    for (const bad of ["not-a-uuid", "' or 1=1--", "", "00000000-0000-4000-8000-00000000e00"])
      expect(isUuid(bad)).toBe(false);
  });
});

describe("whenOffline (a button's own server action call)", () => {
  it("answers the fallback only when the request never reached the server", async () => {
    const fallback = { error: NO_CONNECTION };
    expect(await whenOffline(Promise.reject(new TypeError("Failed to fetch")), fallback)).toBe(
      fallback,
    );
    expect(await whenOffline(Promise.resolve({ error: "No." }), fallback)).toEqual({
      error: "No.",
    });
    await expect(whenOffline(Promise.reject(new Error("render")), fallback)).rejects.toThrow(
      "render",
    );
  });
});
