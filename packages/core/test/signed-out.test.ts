import { describe, expect, it } from "vitest";
import {
  isConnectionError,
  looksSignedOut,
  SIGNED_OUT_MESSAGE,
  signedOutNote,
  syncErrorText,
} from "../src";

describe("signed out by the server (owner, 2026-10-22)", () => {
  it("reads a call without a valid sign-in as signed out", () => {
    expect(looksSignedOut("permission denied for function sync_pull")).toBe(true);
    expect(looksSignedOut("Sign in to sync")).toBe(true);
    expect(looksSignedOut("Invalid Refresh Token: Refresh Token Not Found")).toBe(true);
    expect(looksSignedOut("Auth session missing!")).toBe(true);
    expect(looksSignedOut("JWT expired")).toBe(true);
    expect(looksSignedOut("500 upstream broke")).toBe(false);
    expect(looksSignedOut(null)).toBe(false);
  });

  it("tells a lost connection apart", () => {
    expect(isConnectionError("TypeError: Network request failed")).toBe(true);
    expect(isConnectionError("The request timed out.")).toBe(true);
    expect(isConnectionError("permission denied for function sync_pull")).toBe(false);
  });

  it("never shows the database's own words", () => {
    for (const raw of [
      "permission denied for function sync_pull",
      'relation "job" does not exist',
      "500 upstream broke",
    ]) {
      const text = syncErrorText(raw);
      expect(text).not.toContain("sync_pull");
      expect(text).not.toContain("relation");
      expect(text).not.toContain("500");
    }
    expect(syncErrorText("database or disk is full")).toMatch(/^Phone storage is full/);
  });

  it("says what happens to unsent changes", () => {
    expect(SIGNED_OUT_MESSAGE).toBe("You were signed out. Sign in again to keep going.");
    expect(signedOutNote(0, "tech@shop.test")).toBeNull();
    expect(signedOutNote(1, "tech@shop.test")).toBe(
      "1 change on this phone will sync once you sign in as tech@shop.test. Signing in with another account removes them.",
    );
    expect(signedOutNote(3, "")).toMatch(/^3 changes on this phone will sync once you sign in\./);
  });
});
