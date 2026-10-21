import {
  PLAN_MOVE_CHOICES,
  planMovedBanner,
  visitMovedBanner,
  type JobChange,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useRows } from "../../data/hooks";
import { savePlanDays } from "../../data/serviceRoutes";
import type { TeamMember } from "../../data/schedule";
import { getServices } from "../../lib/services";
import {
  changeSchedule,
  justThisVisit,
  moveAsks,
  takesOffPlan,
  undoChanges,
  type VisitChange,
  type VisitJob,
} from "../../lib/planMove";
import { PUT_BACK, type PlanRow } from "../../lib/serviceRoutes";
import type { BannerNote } from "../../lib/resultBanner";
import { useMenu } from "../../ui/Select";
import { haptics } from "../../ui/haptics";

// Moving a plan's visit asks first (team and week spec section 5), wherever it's moved from: a
// drag, Move…, a stop's menu, a suggested time, the job page or the Jobs list. The action sheet
// has Change Schedule, Just This Visit and Cancel; each change saves through
// the sync layer at once and the banner offers Undo.

/** Save job changes (plan_moved included) through the sync layer, all or none. */
export function saveVisitChanges(companyId: string, updates: VisitChange[]) {
  const { sync } = getServices();
  sync.batch(() => {
    for (const { id, ...values } of updates)
      sync.write("job", id, companyId, values as Record<string, JsonValue>);
  });
}

export function usePlanMove({
  companyId,
  today,
  timeZone,
  team,
  show,
}: {
  companyId: string;
  today: string;
  timeZone: string;
  team: TeamMember[];
  /** The screen's banner (or result line). */
  show: (note: BannerNote) => void;
}) {
  const plans = useRows<PlanRow>("service_plan", companyId);
  // The action sheet: the system's on iPhone, the drawn one on Android (ui/Select), whose
  // Cancel is PLAN_MOVE_CHOICES.cancel.
  const menu = useMenu();
  const fail = (e: unknown) =>
    show({ tone: "error", message: e instanceof Error ? e.message : String(e) });

  /** Save the move with the visit marked `plan_moved`, and offer Undo. */
  function justThis(
    jobId: string,
    input: {
      changes: () => { updates: JobChange[]; error?: string; message?: string } | null;
      before: (id: string) => Record<string, unknown> | undefined;
    },
    /** The banner; else the move's own words ("Taken off the schedule."). */
    message?: string,
  ): boolean {
    const change = input.changes();
    if (!change) return false;
    if (change.error) {
      show({ tone: "error", message: change.error });
      return false;
    }
    const updates = justThisVisit(change.updates, jobId);
    const undo = undoChanges(updates, input.before);
    try {
      saveVisitChanges(companyId, updates);
    } catch (e) {
      fail(e);
      return false;
    }
    show({
      tone: "success",
      message: message ?? change.message ?? visitMovedBanner,
      undo: () => {
        try {
          saveVisitChanges(companyId, undo);
          haptics.light();
          show({ tone: "info", message: PUT_BACK });
        } catch (e) {
          fail(e);
        }
      },
    });
    return true;
  }

  /**
   * Move a job: asks first when it's a plan's visit going to another day or tech, else runs
   * `move` at once. A plan's visit taken off the schedule is saved at once with the visit
   * marked moved, and Undo; so is Just This Visit. False when it was refused or is asking.
   */
  function run(input: {
    job: VisitJob & { customer?: { name?: string | null } | null };
    to: { tech: string | null; date: string | null };
    /** The plain move (no plan to ask about), as the screen did before. */
    move: () => void;
    /** The move's changes for Just This Visit, worked out but not saved; null when refused. */
    changes: () => { updates: JobChange[]; error?: string; message?: string } | null;
    /** Snapshot of a job's columns now, for Undo. */
    before: (id: string) => Record<string, unknown> | undefined;
  }): boolean {
    const { job } = input;
    // Off the schedule, or to nobody yet: a one-off, marked moved with Undo, never asked.
    if (takesOffPlan(job, input.to, timeZone)) return justThis(job.id, input);
    const slots = moveAsks(job, input.to, timeZone);
    if (!slots) {
      input.move();
      return true;
    }
    const customer = job.customer?.name ?? "this customer";
    menu.open({
      title: PLAN_MOVE_CHOICES.title(customer),
      items: [
        {
          label: PLAN_MOVE_CHOICES.changeSchedule,
          onPress: () => {
            const plan = plans.find((p) => p.id === job.service_plan_id && !p.deleted_at);
            if (!plan) return fail("This visit’s plan is gone. Pull down to refresh.");
            const c = changeSchedule(plan, slots, today);
            try {
              savePlanDays(companyId, [c.write]);
            } catch (e) {
              return fail(e);
            }
            const tech = team.find((t) => t.user_id === c.write.assigned_user_id)?.name ?? "";
            show({
              tone: "success",
              message: planMovedBanner(customer, c.weekday, tech),
              undo: () => {
                try {
                  savePlanDays(companyId, [c.undo]);
                  haptics.light();
                  show({ tone: "info", message: PUT_BACK });
                } catch (e) {
                  fail(e);
                }
              },
            });
          },
        },
        {
          label: PLAN_MOVE_CHOICES.justThisVisit,
          onPress: () => void justThis(job.id, input, visitMovedBanner),
        },
      ],
    });
    return false;
  }

  /** `element` is the drawn sheet on Android: render it once in the screen. */
  return { move: run, element: menu.element };
}
