import type { ModuleCases } from "./case";
import { activity } from "./cases/activity";
import { basics } from "./cases/basics";
import { dayMap } from "./cases/day-map";
import { inspection } from "./cases/inspection";
import { maintenance } from "./cases/maintenance";
import { media } from "./cases/media";
import { notifications } from "./cases/notifications";
import { pricing } from "./cases/pricing";
import { routing } from "./cases/routing";
import { routeStartCases } from "./cases/route-start";
import { schedule } from "./cases/schedule";
import { search } from "./cases/search";
import { serviceDaysCases } from "./cases/service-days";
import { todayHeroCases } from "./cases/today-hero";
import { weekPlan } from "./cases/week-plan";
import { download } from "./cases/download";
import { team } from "./cases/team";
import { logoColors } from "./cases/logo-colors";

/** One fixture file per entry: apps/ios/Tests/Fixtures/<name>.json. */
export const modules: Record<string, ModuleCases> = {
  activity,
  basics,
  "day-map": dayMap,
  inspection,
  maintenance,
  media,
  notifications,
  pricing,
  routing,
  "route-start": routeStartCases,
  schedule,
  search,
  "service-days": serviceDaysCases,
  "today-hero": todayHeroCases,
  "week-plan": weekPlan,
  download,
  team,
  "logo-colors": logoColors,
};
