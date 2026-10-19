/**
 * One TypeScript rule and the inputs to run it on. Inputs must be JSON; `run` turns them into
 * the rule's arguments (for example an ISO string into a Date) and returns a JSON result.
 */
export interface RuleCases {
  run: (...args: never[]) => unknown;
  args: unknown[][];
}

export type ModuleCases = Record<string, RuleCases>;

export const rule = <A extends unknown[]>(run: (...args: A) => unknown, args: A[]): RuleCases => ({
  run: run as RuleCases["run"],
  args,
});
