import type { ModuleCases } from "./case";
import { basics } from "./cases/basics";
import { inspection } from "./cases/inspection";
import { media } from "./cases/media";
import { pricing } from "./cases/pricing";

/** One fixture file per entry: apps/ios/Tests/Fixtures/<name>.json. */
export const modules: Record<string, ModuleCases> = { basics, inspection, media, pricing };
