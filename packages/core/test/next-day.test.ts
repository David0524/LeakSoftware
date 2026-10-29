import { describe, expect, it } from "vitest";
import { nextDayCard, type UpcomingStop } from "../src/next-day";

const tz = "America/Phoenix";
const stop = (date: string, name: string, time: string | null = null): UpcomingStop => ({
  date,
  name,
  // Phoenix is UTC-7 all year.
  start: time ? `${date}T${time}:00-07:00` : null,
});

describe("nextDayCard", () => {
  it("names tomorrow, its stops and when the first starts", () => {
    const card = nextDayCard(
      [
        stop("2026-10-30", "Grace Holloway", "08:00"),
        stop("2026-10-30", "Riley Rivera", "10:30"),
        stop("2026-10-30", "Daniel Reyes", "13:30"),
        stop("2026-10-30", "Sam Sample", "15:00"),
      ],
      "2026-10-29",
      tz,
    );
    expect(card).toEqual({
      date: "2026-10-30",
      heading: "Tomorrow",
      button: "See Tomorrow",
      line: "4 stops · first at 8:00 AM",
      names: "Grace Holloway, Riley Rivera, and 2\u00a0more",
    });
  });

  it("skips today and past days, and names a later day", () => {
    const card = nextDayCard(
      [
        stop("2026-10-29", "Today"),
        stop("2026-10-20", "Past"),
        stop("2026-11-03", "Riley Rivera", "09:15"),
        stop("2026-11-03", "Grace Holloway"),
      ],
      "2026-10-29",
      tz,
    );
    expect(card?.heading).toBe("Tue, Nov 3");
    expect(card?.button).toBe("See Tuesday");
    expect(card?.line).toBe("2 stops · first at 9:15 AM");
    expect(card?.names).toBe("Riley Rivera and Grace Holloway");
  });

  it("is nothing past two weeks, and one stop with no time has no time", () => {
    expect(nextDayCard([stop("2026-11-13", "Too Far")], "2026-10-29", tz)).toBeNull();
    expect(nextDayCard([stop("2026-11-12", "Sam Sample")], "2026-10-29", tz)).toMatchObject({
      line: "1 stop",
      names: "Sam Sample",
    });
    expect(
      nextDayCard(
        [stop("2026-10-30", "A"), stop("2026-10-30", "B"), stop("2026-10-30", "C")],
        "2026-10-29",
        tz,
      )?.names,
    ).toBe("A, B, and C");
  });
});
