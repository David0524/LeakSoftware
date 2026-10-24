import {
  PASSWORD_HINT,
  PASSWORD_RULES,
  passwordChecks,
  passwordProblem,
  passwordScore,
  tooManyAttempts,
  type AuthAttemptKind,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// password.ts: the password rules (owner, 2026-10-24) and the sign-in limit messages.
const samples: [string][] = [
  [""],
  ["Ab1!"],
  ["leakbook-demo"],
  ["LEAKBOOKDEMO"],
  ["Leakbook demo 1"],
  ["Pool-Leak-42"],
  ["Ab1 Ab1 Ab1 "],
  ["Ab1€Ab1€Ab1€"],
  ['quote"Q1quote'],
  ["Colon:Q1abcd"],
  ["Back\\slashQ1"],
  ["ÉÉÉÉéééé1!"],
  ["Aa1!🙂🙂🙂🙂🙂🙂"],
  ["Aa1!🙂🙂🙂🙂🙂"],
  [`Aa1!${"x".repeat(68)}`],
  [`Aa1!${"x".repeat(69)}`],
  [`Aa1!${"é".repeat(34)}`],
  [`Aa1!${"é".repeat(35)}`],
];

export const password: ModuleCases = {
  PASSWORD_RULES: rule(() => PASSWORD_RULES, [[]]),
  PASSWORD_HINT: rule(() => PASSWORD_HINT, [[]]),
  passwordChecks: rule((p: string) => passwordChecks(p), samples),
  passwordScore: rule((p: string) => passwordScore(p), samples),
  passwordProblem: rule((p: string) => passwordProblem(p), samples),
  tooManyAttempts: rule(
    (k: AuthAttemptKind) => tooManyAttempts(k),
    [["sign_in"], ["two_step"], ["sign_up"], ["link"], ["reset"]],
  ),
};
