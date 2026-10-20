import { useMemo } from "react";
import { todayHero, type TodayHero } from "@leakbook/core";
import { useChecklistProgress } from "../../data/inspection";
import type { JobView } from "../../data/jobs";
import { checklistCount, heroStops } from "../../lib/todayHero";

/** No job: the checklist hooks read nothing. */
const NONE = "00000000-0000-0000-0000-000000000000";

/**
 * Today's card and Android's current-stop notification (owner, 2026-10-20): core todayHero over
 * a tech's stops in route order, with the card's stop's checklist count from its own rows (a
 * pool inspection counts only the questions its gates leave open). `justDone` is a stop
 * completed in the last minute (lib/liveStop), shown done before the card moves on.
 */
export function useTodayHero(input: {
  companyId: string;
  stops: JobView[];
  today: string;
  timeZone: string;
  justDone?: string | null;
}): { hero: TodayHero | null; job: JobView | undefined } {
  const { companyId, stops, today, timeZone, justDone } = input;
  const plain = useMemo(
    () => todayHero({ stops: heroStops(stops), today, timeZone, justDone }),
    [stops, today, timeZone, justDone],
  );
  const job = plain?.stopId ? stops.find((s) => s.id === plain.stopId) : undefined;
  const progress = useChecklistProgress(companyId, job?.id ?? NONE, job?.type);
  const count = checklistCount(progress);
  const hero = useMemo(
    () =>
      job
        ? todayHero({
            stops: heroStops(stops, new Map([[job.id, count]])),
            today,
            timeZone,
            justDone,
          })
        : plain,
    // count is rebuilt each render; its numbers are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plain, job, stops, today, timeZone, justDone, count.done, count.total],
  );
  return { hero, job };
}
