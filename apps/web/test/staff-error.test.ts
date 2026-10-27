import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SERVER_TROUBLE_MESSAGE, TEXT_FAILED_MESSAGE } from "@leakbook/core";
import {
  SEND_FAILED_MESSAGE,
  StaffError,
  failedSendText,
  reportedErrorText,
  staffActionError,
  staffFailure,
} from "../src/server/staff-error";

// The Admin portal never shows a database, Stripe, Supabase or provider message
// (owner, 2026-10-27): the raw text goes to the log.
describe("the Admin portal's error words", () => {
  const log = vi.spyOn(console, "error");
  beforeEach(() => log.mockImplementation(() => {}));
  afterEach(() => log.mockReset());

  it("puts a failure from the database in plain words and logs the raw text", () => {
    const e = staffFailure('duplicate key value violates unique constraint "company_pkey"', "x");
    expect(e.message).toBe("That already exists.");
    expect(log).toHaveBeenCalledWith("[admin] x:", expect.stringContaining("duplicate key"));
    expect(staffFailure("Stripe said: No such customer: cus_123", "x").message).toBe(
      "Payments are having trouble right now. Try again in a moment.",
    );
    // Text no rule knows is a code's or a provider's: one plain line.
    expect(staffFailure("Cannot read properties of undefined (reading 'id')", "x").message).toBe(
      SERVER_TROUBLE_MESSAGE,
    );
    expect(staffFailure(new TypeError("fetch failed"), "x").message).toMatch(/^No connection/);
  });

  it("passes our own sentences through, and words an unexpected throw", () => {
    expect(staffActionError(new StaffError("Only staff can do this."), "x")).toBe(
      "Only staff can do this.",
    );
    expect(staffActionError(new Error('relation "staff_action" does not exist'), "x")).toBe(
      SERVER_TROUBLE_MESSAGE,
    );
  });

  it("words a failed email or text without its provider's message", () => {
    expect(failedSendText(null, "x")).toBeNull();
    expect(failedSendText("Twilio 21610: unsubscribed recipient", "x")).not.toMatch(
      /twilio|21610/i,
    );
    expect(failedSendText("Twilio error 30007", "x")).toBe(TEXT_FAILED_MESSAGE);
    expect(failedSendText("Mailbox unavailable: 550 5.1.1 user unknown", "x")).toBe(
      SEND_FAILED_MESSAGE,
    );
  });

  it("names an error screen without repeating the crash", () => {
    expect(reportedErrorText("Error screen: Cannot read properties of undefined", "x")).toBe(
      `Error screen: ${SERVER_TROUBLE_MESSAGE}`,
    );
    expect(reportedErrorText("Error screen: Failed to fetch", "x")).toMatch(
      /^Error screen: No connection/,
    );
    expect(reportedErrorText("duplicate key value violates unique constraint", "x")).toBe(
      "That already exists.",
    );
    // A save that failed was already worded for the person who saw it.
    expect(reportedErrorText("Enter the customer’s email.", "x")).toBe(
      "Enter the customer’s email.",
    );
    expect(reportedErrorText(null, "x")).toBeNull();
  });
});
