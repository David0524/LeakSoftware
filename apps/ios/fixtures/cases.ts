import type { ModuleCases } from "./case";
import { basics } from "./cases/basics";
import { inspection } from "./cases/inspection";
import { maintenance } from "./cases/maintenance";
import { media } from "./cases/media";
import { pricing } from "./cases/pricing";
import { routing } from "./cases/routing";
import { schedule } from "./cases/schedule";

/** One fixture file per entry: apps/ios/Tests/Fixtures/<name>.json. */
export const modules: Record<string, ModuleCases> = {
  basics,
  inspection,
  maintenance,
  media,
  pricing,
  routing,
  schedule,
};
