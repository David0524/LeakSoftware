import type { ModuleCases } from "./case";
import { basics } from "./cases/basics";
import { inspection } from "./cases/inspection";
import { maintenance } from "./cases/maintenance";
import { media } from "./cases/media";
import { notifications } from "./cases/notifications";
import { pricing } from "./cases/pricing";
import { routing } from "./cases/routing";
import { schedule } from "./cases/schedule";
import { todayHeroCases } from "./cases/today-hero";

/** One fixture file per entry: apps/ios/Tests/Fixtures/<name>.json. */
export const modules: Record<string, ModuleCases> = {
  basics,
  inspection,
  maintenance,
  media,
  notifications,
  pricing,
  routing,
  schedule,
  "today-hero": todayHeroCases,
};
