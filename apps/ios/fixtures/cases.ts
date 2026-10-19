import type { ModuleCases } from "./case";
import { basics } from "./cases/basics";

/** One fixture file per entry: apps/ios/Tests/Fixtures/<name>.json. */
export const modules: Record<string, ModuleCases> = { basics };
