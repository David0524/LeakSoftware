import type { ModuleCases } from "./case";
import { basics } from "./cases/basics";
import { dayMap } from "./cases/day-map";
import { inspection } from "./cases/inspection";
import { maintenance } from "./cases/maintenance";
import { media } from "./cases/media";
import { notifications } from "./cases/notifications";
import { pricing } from "./cases/pricing";
import { routing } from "./cases/routing";
import { schedule } from "./cases/schedule";
import { serviceDaysCases } from "./cases/service-days";
import { todayHeroCases } from "./cases/today-hero";
import { weekPlan } from "./cases/week-plan";
import { download } from "./cases/download";

/** One fixture file per entry: apps/ios/Tests/Fixtures/<name>.json. */
export const modules: Record<string, ModuleCases> = {
  basics,
  "day-map": dayMap,
  inspection,
  maintenance,
  media,
  notifications,
  pricing,
  routing,
  schedule,
  "service-days": serviceDaysCases,
  "today-hero": todayHeroCases,
  "week-plan": weekPlan,
  download,
};
