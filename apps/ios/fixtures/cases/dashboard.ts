import {
  techFeedbackNote,
  techInvoicedNote,
  techJobsNote,
  type DashboardTech,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// dashboard.ts by tech (owner, 2026-11-24: "Tech specific stats in the dashboard"): the words
// under each tech on the Dashboard.

const tech: DashboardTech = {
  user_id: "u1",
  name: "Maria Lopez",
  color: "blue",
  active: true,
  jobs_done: 14,
  jobs_open: 3,
  invoiced_cents: 500000,
  collected_cents: 1248000,
  thumbs_up: 9,
  thumbs_down: 1,
  on_site_minutes: 95,
};
const techs: DashboardTech[] = [
  tech,
  { ...tech, jobs_done: 1, jobs_open: 0, invoiced_cents: 0, thumbs_up: 0, thumbs_down: 0 },
  { ...tech, on_site_minutes: null, thumbs_up: 0, thumbs_down: 2 },
  { ...tech, jobs_done: 0, thumbs_up: 0, thumbs_down: 0, on_site_minutes: null },
  { ...tech, on_site_minutes: 60, invoiced_cents: 1999 },
];

export const dashboard: ModuleCases = {
  techJobsNote: rule(
    (t: DashboardTech) => techJobsNote(t),
    techs.map((t) => [t] as [DashboardTech]),
  ),
  techInvoicedNote: rule(
    (t: DashboardTech) => techInvoicedNote(t),
    techs.map((t) => [t] as [DashboardTech]),
  ),
  techFeedbackNote: rule(
    (t: DashboardTech) => techFeedbackNote(t),
    techs.map((t) => [t] as [DashboardTech]),
  ),
};
