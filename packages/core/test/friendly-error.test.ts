import { describe, expect, it } from "vitest";
import {
  ALREADY_EXISTS_MESSAGE,
  GENERIC_ERROR_MESSAGE,
  NOT_ALLOWED_MESSAGE,
  NO_CONNECTION_MESSAGE,
  NO_PERMISSION_MESSAGE,
  PAYMENTS_TROUBLE_MESSAGE,
  SERVER_TROUBLE_MESSAGE,
  SIGN_IN_AGAIN_MESSAGE,
  TEXT_BAD_NUMBER_MESSAGE,
  TEXT_FAILED_MESSAGE,
  TEXT_OPTED_OUT_MESSAGE,
  friendlyError,
} from "../src";

describe("friendlyError", () => {
  it.each([
    ['duplicate key value violates unique constraint "job_pkey"', ALREADY_EXISTS_MESSAGE],
    ["JWT expired", SIGN_IN_AGAIN_MESSAGE],
    ["TypeError: Failed to fetch", NO_CONNECTION_MESSAGE],
    ["Load failed", NO_CONNECTION_MESSAGE],
    ["Network request failed", NO_CONNECTION_MESSAGE],
    ["The operation couldn’t be completed. (NSURLErrorDomain error -1009.)", NO_CONNECTION_MESSAGE],
    ['Error Domain=NSCocoaErrorDomain Code=4 "The file doesn’t exist."', GENERIC_ERROR_MESSAGE],
    ["The server said 500.", SERVER_TROUBLE_MESSAGE],
    ["The server said 403.", NO_PERMISSION_MESSAGE],
    ['new row for relation "job" violates row-level security policy', NO_PERMISSION_MESSAGE],
    [
      'new row for relation "job" violates check constraint "job_status_check"',
      NOT_ALLOWED_MESSAGE,
    ],
    [
      "Stripe said: No such customer: 'cus_123'; Request req_AbCdEf123456",
      PAYMENTS_TROUBLE_MESSAGE,
    ],
    [
      "Not sent: Unable to create record: Attempt to send to unsubscribed recipient",
      TEXT_OPTED_OUT_MESSAGE,
    ],
    [
      "Not sent: The 'To' number +1555 is not a valid phone number (21211)",
      TEXT_BAD_NUMBER_MESSAGE,
    ],
    ["Not sent: something odd", TEXT_FAILED_MESSAGE],
    ["Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON", SERVER_TROUBLE_MESSAGE],
    ["invalidDate", GENERIC_ERROR_MESSAGE],
    ["", GENERIC_ERROR_MESSAGE],
  ])("%s", (raw, text) => {
    expect(friendlyError(raw)).toBe(text);
  });

  it("keeps the app's own sentences", () => {
    for (const own of [
      "Enter the customer’s email.",
      "Enter an amount up to the balance due",
      "The photos haven’t finished uploading yet. Try again in a moment.",
      "No connection. Try again when you have signal.",
    ])
      expect(friendlyError(own)).toBe(own);
  });

  it("reads an Error's message and uses the fallback for no words", () => {
    expect(friendlyError(new TypeError("Failed to fetch"))).toBe(NO_CONNECTION_MESSAGE);
    expect(friendlyError(undefined, "Try later.")).toBe("Try later.");
    expect(friendlyError({ message: "JWT expired" })).toBe(SIGN_IN_AGAIN_MESSAGE);
  });
});
