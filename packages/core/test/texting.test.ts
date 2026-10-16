import { describe, expect, it } from "vitest";
import { conversationPreview, formatPhone, inBusinessHours, optKeyword, toE164 } from "../src";

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
