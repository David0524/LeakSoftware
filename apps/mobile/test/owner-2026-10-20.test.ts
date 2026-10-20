import { describe, expect, it } from "vitest";
import { phoneEdit } from "../src/lib/phoneTyping";
import {
  SYNC_NOTE_DELAY_MS,
  syncBarStatus,
  syncNoteDueAt,
  withWaitingSince,
} from "../src/lib/syncNote";
import type { SyncStatus } from "../src/lib/sync-service";
import { teamProfileValues } from "../src/lib/teamProfile";

// Owner, 2026-10-20: phone numbers as typed, the sync note's delay, team profiles.

describe("phone numbers format as they're typed", () => {
  it("adds the marks while typing at the end", () => {
    expect(phoneEdit("", "6")).toEqual({ text: "(6", caret: 2 });
    expect(phoneEdit("(602", "(6025")).toEqual({ text: "(602) 5", caret: 7 });
    expect(phoneEdit("(602) 555", "(602) 5550")).toEqual({ text: "(602) 555-0", caret: 11 });
    expect(phoneEdit("", "16025550142").text).toBe("+1 (602) 555-0142");
  });
  it("keeps the caret after the digit it was after, mid-number", () => {
    // A 9 typed after "(60": the rest moves along and the caret follows the 9.
    const r = phoneEdit("(602) 555", "(6092) 555");
    expect(r.text).toBe("(609) 255-5");
    expect(r.caret).toBe(4);
  });
  it("deleting a ) or - removes the digit before it", () => {
    expect(phoneEdit("(602) 555-0", "(602) 5550")).toEqual({ text: "(602) 550", caret: 8 });
    expect(phoneEdit("(602) 5", "(602 5").text).toBe("(605");
  });
  it("leaves other countries and letters as typed", () => {
    expect(phoneEdit("+4", "+44").text).toBe("+44");
    expect(phoneEdit("", "ext").text).toBe("ext");
  });
});

const base: SyncStatus = {
  phase: "idle",
  pending: 0,
  problems: [],
  lastSyncedAt: 1,
  initialSyncDone: true,
  error: null,
  uploads: { waiting: 0, allPhotos: true, lastError: null },
  storageLow: false,
  waitingSince: null,
};

describe("the waiting-to-sync note waits 8 seconds", () => {
  it("tracks since when changes have waited without a break", () => {
    const a = withWaitingSince({ ...base, pending: 1 }, base, 1000);
    expect(a.waitingSince).toBe(1000);
    const b = withWaitingSince({ ...a, pending: 2 }, a, 5000);
    expect(b.waitingSince).toBe(1000);
    expect(withWaitingSince({ ...b, pending: 0 }, b, 6000).waitingSince).toBeNull();
  });
  it("hides waiting changes until 8 seconds, then shows them", () => {
    const s = { ...base, pending: 1, waitingSince: 1000 };
    expect(syncBarStatus(s, 1000 + SYNC_NOTE_DELAY_MS - 1).pending).toBe(0);
    expect(syncNoteDueAt(s, 2000)).toBe(1000 + SYNC_NOTE_DELAY_MS);
    expect(syncBarStatus(s, 1000 + SYNC_NOTE_DELAY_MS).pending).toBe(1);
    expect(syncNoteDueAt(s, 1000 + SYNC_NOTE_DELAY_MS)).toBeNull();
  });
});

describe("team profiles", () => {
  const form = {
    name: " Tony ",
    phone: "",
    email: "",
    address: "",
    emergency_name: "",
    emergency_phone: "",
    notes: "",
  };
  it("needs a name and a real email", () => {
    expect(teamProfileValues({ ...form, name: " " })).toEqual({
      fields: { name: "Enter a name." },
    });
    expect(teamProfileValues({ ...form, email: "tony@" })).toEqual({
      fields: { email: "Enter an email like name@example.com." },
    });
  });
  it("trims and leaves blanks empty", () => {
    expect(teamProfileValues({ ...form, phone: "(602) 555-0142" })).toEqual({
      values: {
        name: "Tony",
        phone: "(602) 555-0142",
        email: null,
        address: null,
        emergency_name: null,
        emergency_phone: null,
        notes: null,
      },
    });
  });
});

describe("address suggestions", () => {
  it("shows the place as City, ST ZIP", async () => {
    const { suggestionPlace } = await import("../src/lib/addressPlace");
    expect(suggestionPlace({ city: "Phoenix", state: "AZ", postal_code: "85001" })).toBe(
      "Phoenix, AZ 85001",
    );
    expect(suggestionPlace({ city: "", state: "AZ", postal_code: "" })).toBe("AZ");
  });
});
