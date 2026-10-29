import { addDays, formatDay } from "./office";
import { localMinutes } from "./route-plan";
import { minutesLabel } from "./routing";

/**
 * An empty Today shows the next day with stops (owner, 2026-10-29: "An empty Today shows
 * what's next"): its day, how many stops and when the first starts, and who's on it.
 */
export interface UpcomingStop {
  /** The shop's local date, YYYY-MM-DD. */
  date: string;
  /** When it starts (ISO), if it has a time. */
  start: string | null;
  /** The customer's name. */
  name: string;
}

/** How far ahead an empty Today looks. */
export const NEXT_DAY_LOOKAHEAD = 14;

export interface NextDayCard {
  date: string;
  /** "Tomorrow", or "Mon, Nov 3". */
  heading: string;
  /** "See Tomorrow", or "See Monday". */
  button: string;
  /** "4 stops · first at 8:00 AM". */
  line: string;
  /** "Grace Holloway, Riley Rivera, and 2 more" ("2 more" kept on one line). */
  names: string;
}

/**
 * The first day after today, up to two weeks out, with stops (given in route order), or null.
 */
export function nextDayCard(
  stops: UpcomingStop[],
  today: string,
  timeZone: string,
): NextDayCard | null {
  const last = addDays(today, NEXT_DAY_LOOKAHEAD);
  const date = stops
    .map((s) => s.date)
    .filter((d) => d > today && d <= last)
    .sort()[0];
  if (!date) return null;
  const on = stops.filter((s) => s.date === date);
  const tomorrow = date === addDays(today, 1);
  const first = on
    .map((s) => s.start)
    .filter((s): s is string => !!s)
    .sort()[0];
  const count = `${on.length} ${on.length === 1 ? "stop" : "stops"}`;
  const names = [...new Set(on.map((s) => s.name))];
  return {
    date,
    heading: tomorrow ? "Tomorrow" : formatDay(date, "short"),
    button: tomorrow ? "See Tomorrow" : `See ${formatDay(date, "long").split(",")[0]}`,
    line: first ? `${count} · first at ${minutesLabel(localMinutes(first, timeZone))}` : count,
    names:
      names.length <= 2
        ? names.join(" and ")
        : names.length === 3
          ? `${names[0]}, ${names[1]}, and ${names[2]}`
          : `${names[0]}, ${names[1]}, and ${names.length - 2}\u00a0more`,
  };
}
