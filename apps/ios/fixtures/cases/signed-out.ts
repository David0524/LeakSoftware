import {
  isConnectionError,
  looksSignedOut,
  SIGNED_OUT_MESSAGE,
  signedOutNote,
  syncErrorText,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

const errors: [string | null][] = [
  ["permission denied for function sync_pull"],
  ["permission denied for function sync_pull_count"],
  ["Sign in to sync"],
  ["Invalid Refresh Token: Refresh Token Not Found"],
  ["Auth session missing!"],
  ["JWT expired"],
  ["new row violates row-level security policy, code 42501"],
  ["TypeError: Network request failed"],
  ["The Internet connection appears to be offline."],
  ["The request timed out."],
  ["database or disk is full"],
  ["500 upstream broke"],
  ['relation "job" does not exist'],
  [""],
  [null],
];

// signed-out.ts: the server ended this phone's sign-in (owner, 2026-10-22).
export const signedOut: ModuleCases = {
  SIGNED_OUT_MESSAGE: rule(() => SIGNED_OUT_MESSAGE, [[]]),
  signedOutNote: rule(
    (pending: number, email: string) => signedOutNote(pending, email),
    [
      [0, "tech@shop.test"],
      [-2, "tech@shop.test"],
      [1, "tech@shop.test"],
      [3, " owner@shop.test "],
      [12, ""],
    ],
  ),
  looksSignedOut: rule((m: string | null) => looksSignedOut(m), errors),
  isConnectionError: rule((m: string | null) => isConnectionError(m), errors),
  syncErrorText: rule((m: string | null) => syncErrorText(m), errors),
};
