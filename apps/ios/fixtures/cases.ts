import type { ModuleCases } from "./case";
import { basics } from "./cases/basics";
import { media } from "./cases/media";

/** One fixture file per entry: apps/ios/Tests/Fixtures/<name>.json. */
export const modules: Record<string, ModuleCases> = { basics, media };
