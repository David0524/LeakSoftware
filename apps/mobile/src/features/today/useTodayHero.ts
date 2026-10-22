import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { checklistReady, todayHero, type StopCleaning, type TodayHero } from "@leakbook/core";
import { useChecklistProgress } from "../../data/inspection";
import type { JobView } from "../../data/jobs";
import { useStopCleanings } from "../maintenance/Cleanings";
import { checklistCount, heroStops } from "../../lib/todayHero";

/** No job: the checklist hooks read nothing. */
const NONE = "00000000-0000-0000-0000-000000000000";
const NO_CLEANINGS: StopCleaning[] = [];

/**
 * Today's card and Android's current-stop notification (owner, 2026-10-20): core todayHero over
 * a tech's stops in route order, with the card's stop's checklist count from its own rows (a
 * pool inspection counts only the questions its gates leave open). `justDone` is a stop
 * completed in the last minute (lib/liveStop), shown done before the card moves on. Each stop
 * carries its plan cleanings (filter, salt cell) as its row on Today shows them; `cleanings` are
 * the card's stop's, for the notification's words.
 */
export function useTodayHero(input: {
  companyId: string;
  stops: JobView[];
  today: string;
  timeZone: string;
  justDone?: string | null;
  /**
   * A stop the tech swiped or tapped to on Today's card (owner, 2026-10-20); the notification
   * never passes one, so it always follows the stop the day is on.
   */
  viewing?: string | null;
}): {
  hero: TodayHero | null;
  job: JobView | undefined;
  cleanings: StopCleaning[];
  /** The card's stop's checklist is all done: Mark Complete is the last thing (2026-10-22). */
  checklistDone: boolean;
} {
  const { companyId, stops, today, timeZone, justDone, viewing = null } = input;
  const cleanings = useStopCleanings(companyId, stops);
  const plain = useMemo(
    () =>
      todayHero({
        stops: heroStops(stops, new Map(), cleanings),
        today,
        timeZone,
        justDone,
        viewing,
      }),
    [stops, cleanings, today, timeZone, justDone, viewing],
  );
  const job = plain?.stopId ? stops.find((s) => s.id === plain.stopId) : undefined;
  const progress = useChecklistProgress(companyId, job?.id ?? NONE, job?.type);
  const count = checklistCount(progress);
  const hero = useMemo(
    () =>
      job
        ? todayHero({
            stops: heroStops(stops, new Map([[job.id, count]]), cleanings),
            today,
            timeZone,
            justDone,
            viewing,
          })
        : plain,
    // count is rebuilt each render; its numbers are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plain, job, stops, cleanings, today, timeZone, justDone, viewing, count.done, count.total],
  );
  return {
    hero,
    job,
    cleanings: (job && cleanings.get(job.id)) || NO_CLEANINGS,
    checklistDone: !!job && checklistReady(count.done, count.total),
  };
}

/**
 * The stop Today's card shows when the tech picked one (null: the stop the day is on). It goes
 * back by itself when the app comes to the front again and whenever `resetKey` changes (the day,
 * whose day, a stop starting or completing: lib/heroBrowse viewingResetKey). Local state only, so
 * browsing never waits on the network.
 */
export function useHeroViewing(resetKey: string): [string | null, (id: string | null) => void] {
  const [viewing, setViewing] = useState<string | null>(null);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    if (viewing !== null) setViewing(null);
  }
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") setViewing(null);
    });
    return () => sub.remove();
  }, []);
  return [viewing, setViewing];
}
