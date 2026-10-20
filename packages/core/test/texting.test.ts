import { describe, expect, it } from "vitest";
import {
  conversationPreview,
  formatPhone,
  inBusinessHours,
  optKeyword,
  toE164,
  formatPhoneTyping,
  phoneCaret,
} from "../src";

describe("phone numbers", () => {
  it("reads US numbers however they're typed", () => {
    for (const v of [
      "(602) 555-0142",
      "602.555.0142",
      "1-602-555-0142",
      "+1 602 555 0142",
      "6025550142",
    ])
      expect(toE164(v)).toBe("+16025550142");
    expect(toE164("555-0142")).toBeNull();
    expect(toE164("(102) 555-0142")).toBeNull();
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
    expect(toE164("")).toBeNull();
    expect(formatPhone("+16025550142")).toBe("(602) 555-0142");
  });
});

describe("business hours", () => {
  // Defaults: 8:00 AM to 5:00 PM, Monday to Friday. Phoenix is UTC-7 all year.
  const tz = "America/Phoenix";
  it("ring the team on weekdays during the working day", () => {
    expect(inBusinessHours(new Date("2026-10-15T16:00:00Z"), tz, {})).toBe(true); // Thu 9 AM
    expect(inBusinessHours(new Date("2026-10-15T14:30:00Z"), tz, {})).toBe(false); // 7:30 AM
    expect(inBusinessHours(new Date("2026-10-16T00:00:00Z"), tz, {})).toBe(false); // Thu 5 PM
    expect(inBusinessHours(new Date("2026-10-17T18:00:00Z"), tz, {})).toBe(false); // Saturday
  });
  it("follow the shop's own hours", () => {
    const sat = {
      routing: { work_days: [1, 2, 3, 4, 5, 6], day_start: "07:00", day_end: "15:00" },
    };
    expect(inBusinessHours(new Date("2026-10-17T15:00:00Z"), tz, sat)).toBe(true); // Sat 8 AM
    expect(inBusinessHours(new Date("2026-10-15T22:30:00Z"), tz, sat)).toBe(false); // 3:30 PM
  });
});

describe("keywords and previews", () => {
  it("knows the carrier keywords", () => {
    expect(optKeyword(" stop ")).toBe("stop");
    expect(optKeyword("Unsubscribe")).toBe("stop");
    expect(optKeyword("START")).toBe("start");
    expect(optKeyword("help")).toBe("help");
    expect(optKeyword("Please stop by at 3")).toBeNull();
  });
  it("previews texts and calls", () => {
    expect(conversationPreview({ kind: "text", body: "On my  way\n", pictures: 0 })).toBe(
      "On my way",
    );
    expect(conversationPreview({ kind: "text", body: "", pictures: 2 })).toBe("2 pictures");
    expect(conversationPreview({ kind: "call", status: "missed" })).toBe("Missed call");
    expect(conversationPreview({ kind: "call", status: "voicemail" })).toBe("Voicemail");
  });
});

describe("phone numbers as they're typed (owner, 2026-10-20)", () => {
  it("adds the parentheses, space and dash", () => {
    const steps = [
      "6",
      "60",
      "602",
      "6025",
      "60255",
      "602555",
      "6025550",
      "60255501",
      "6025550142",
    ];
    expect(steps.map(formatPhoneTyping)).toEqual([
      "(6",
      "(60",
      "(602",
      "(602) 5",
      "(602) 55",
      "(602) 555",
      "(602) 555-0",
      "(602) 555-01",
      "(602) 555-0142",
    ]);
    expect(formatPhoneTyping("(602) 555-0142")).toBe("(602) 555-0142");
    expect(formatPhoneTyping("602.555.0142")).toBe("(602) 555-0142");
    expect(formatPhoneTyping("")).toBe("");
  });

  it("keeps a leading 1 as the country code", () => {
    expect(formatPhoneTyping("16025550142")).toBe("+1 (602) 555-0142");
    expect(formatPhoneTyping("+1 602")).toBe("+1 (602");
  });

  it("leaves other numbers as typed", () => {
    expect(formatPhoneTyping("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(formatPhoneTyping("602 555 0142 ext 5")).toBe("602 555 0142 ext 5");
    expect(formatPhoneTyping("60255501421")).toBe("60255501421");
  });

  it("puts the caret after the same digit", () => {
    expect(phoneCaret("(602) 555-0142", 3)).toBe(4);
    expect(phoneCaret("(602) 555-0142", 4)).toBe(7);
    expect(phoneCaret("(602) 555-0142", 10)).toBe(14);
    expect(phoneCaret("(602", 0)).toBe(0);
  });
});
