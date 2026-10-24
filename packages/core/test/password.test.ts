import { describe, expect, it } from "vitest";
import {
  PASSWORD_RULES,
  passwordChecks,
  passwordProblem,
  passwordScore,
  tooManyAttempts,
} from "../src";

describe("password rules", () => {
  it("lists the five rules in order", () => {
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual([
      "length",
      "upper",
      "lower",
      "number",
      "symbol",
    ]);
  });
  it("accepts 10+ characters with every kind", () => {
    expect(passwordProblem("Pool-Leak-42")).toBeNull();
    expect(passwordScore("Pool-Leak-42")).toBe(5);
  });
  it("says what's missing, length first", () => {
    expect(passwordProblem("Ab1!")).toBe("Use at least 10 characters.");
    expect(passwordProblem("leakbook-demo")).toBe("Add an uppercase letter and a number.");
    expect(passwordProblem("LEAKBOOKDEMO")).toBe("Add a lowercase letter, a number and a symbol.");
    expect(passwordProblem("Leakbook demo 1")).toBe("Add a symbol.");
  });
  it("counts Supabase's symbols only (a space or an accented letter isn't one)", () => {
    expect(passwordChecks("Ab1 ").symbol).toBe(false);
    expect(passwordChecks("Ab1€").symbol).toBe(false);
    expect(passwordChecks('a"b').symbol).toBe(true);
    expect(passwordChecks("a:b").symbol).toBe(true);
    expect(passwordChecks("Éé").upper).toBe(false);
  });
  it("counts characters, not bytes, and caps at 72 bytes", () => {
    expect(passwordChecks("Aa1!🙂🙂🙂🙂🙂🙂").length).toBe(true);
    expect(passwordChecks("Aa1!🙂🙂🙂🙂🙂").length).toBe(false);
    expect(passwordProblem(`Aa1!${"x".repeat(68)}`)).toBeNull();
    expect(passwordProblem(`Aa1!${"x".repeat(69)}`)).toBe("Use 72 characters or fewer.");
  });
  it("tells a visitor how long to wait", () => {
    expect(tooManyAttempts("sign_in")).toBe("Too many attempts. Try again in 15 minutes.");
    expect(tooManyAttempts("reset")).toBe("Too many attempts. Try again in an hour.");
  });
});
