export { tokens } from "./generated";

import { tokens } from "./generated";

/** Color roles for the field app (always light; dark screens wash out in sun). */
export const fieldTheme = tokens.color.role.light;

export type StatusKey = keyof typeof tokens.color.status;
