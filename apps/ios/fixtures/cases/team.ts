import {
  MAPS_LABELS,
  PLAN_MOVE_CHOICES,
  TECH_COLORS,
  asksPlanMove,
  dayMapsLabel,
  nextTechColor,
  planMovedBanner,
  teamOrder,
  techColor,
  visitMovedBanner,
  type MapsApp,
  type VisitSlot,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// team.ts (Team colors, Team's order, moving a plan visit; owner, 2026-10-20) and the Maps
// wording in routing.ts.

type Member = { name: string | null; status: string; disabled_at?: string | null };
const all = TECH_COLORS.map((c) => c.key);
const slot = (date: string, techId: string | null): VisitSlot => ({ date, techId });
const from = slot("2026-10-21", "luis");

export const team: ModuleCases = {
  TECH_COLORS: rule(() => TECH_COLORS, [[]]),
  techColor: rule(
    (v: unknown) => techColor(v),
    [["blue"], ["slate"], ["olive"], ["Blue"], ["navy"], [""], [null], [7]],
  ),
  nextTechColor: rule(
    (used: (string | null)[]) => nextTechColor(used),
    [
      [[]],
      [["blue", "green"]],
      [["green", null, "nope"]],
      [["blue", "blue", "orange"]],
      [all],
      [[...all, "blue", "green"]],
      [[...all, ...all.filter((k) => k !== "red")]],
    ],
  ),
  teamOrder: rule(
    (members: Member[]) => teamOrder(members),
    [
      [
        [
          { name: "tony", status: "active" },
          { name: null, status: "active" },
          { name: "Ángela", status: "active" },
          { name: "Priya", status: "active" },
          { name: "  ", status: "active" },
          { name: "Dana", status: "active", disabled_at: null },
        ],
      ],
      [
        [
          { name: "Old", status: "disabled", disabled_at: "2026-01-01T00:00:00Z" },
          { name: "Zed", status: "disabled", disabled_at: null },
          { name: "Amy", status: "disabled" },
          { name: "Recent", status: "disabled", disabled_at: "2026-10-01T00:00:00.000Z" },
          { name: "Same B", status: "disabled", disabled_at: "2026-05-01T00:00:00Z" },
          { name: "same a", status: "disabled", disabled_at: "2026-05-01T00:00:00Z" },
          { name: "Here", status: "active" },
          { name: "émile", status: "active" },
        ],
      ],
      [[]],
    ],
  ),
  asksPlanMove: rule(
    (
      job: { service_plan_id?: string | null; status: string },
      move?: { from: VisitSlot; to: VisitSlot },
    ) => asksPlanMove(job, move),
    [
      [{ service_plan_id: "p1", status: "scheduled" }],
      [{ service_plan_id: null, status: "scheduled" }],
      [{ status: "scheduled" }],
      ...["unscheduled", "in_progress", "done", "canceled"].map(
        (status) =>
          [{ service_plan_id: "p1", status }] as [{ service_plan_id: string; status: string }],
      ),
      [
        { service_plan_id: "p1", status: "scheduled" },
        { from, to: slot("2026-10-21", "luis") },
      ],
      [
        { service_plan_id: "p1", status: "scheduled" },
        { from, to: slot("2026-10-22", "luis") },
      ],
      [
        { service_plan_id: "p1", status: "scheduled" },
        { from, to: slot("2026-10-21", "priya") },
      ],
      [
        { service_plan_id: "p1", status: "scheduled" },
        { from, to: slot("2026-10-21", null) },
      ],
      [
        { service_plan_id: "p1", status: "done" },
        { from, to: slot("2026-10-22", "luis") },
      ],
    ],
  ),
  PLAN_MOVE_CHOICES: rule(
    (customer: string) => ({
      title: PLAN_MOVE_CHOICES.title(customer),
      changeSchedule: PLAN_MOVE_CHOICES.changeSchedule,
      justThisVisit: PLAN_MOVE_CHOICES.justThisVisit,
      cancel: PLAN_MOVE_CHOICES.cancel,
    }),
    [["Rivera"], ["O'Neil Pools"]],
  ),
  planMovedBanner: rule(
    (customer: string, weekday: string, tech: string) => planMovedBanner(customer, weekday, tech),
    [
      ["Rivera", "Tuesday", "Luis"],
      ["Rivera", "Friday", ""],
      ["Rivera", "Monday", "  Priya Shah "],
    ],
  ),
  visitMovedBanner: rule(() => visitMovedBanner, [[]]),
  MAPS_LABELS: rule(() => MAPS_LABELS, [[]]),
  dayMapsLabel: rule((app: MapsApp) => dayMapsLabel(app), [["apple"], ["google"]]),
};
