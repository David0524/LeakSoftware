import { describe, expect, it } from "vitest";
import { isUsNumber, safePath } from "../src";

describe("after sign-in", () => {
  it("goes only to paths on this site", () => {
    expect(safePath("/jobs?status=open")).toBe("/jobs?status=open");
    expect(safePath("/messages/abc")).toBe("/messages/abc");
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "/\\/evil.com",
      "https://evil.com",
      "evil.com",
      "/\tevil",
      "",
      null,
      undefined,
    ]) {
      expect(safePath(bad)).toBe("/home");
    }
    expect(safePath("//evil.com", "/today")).toBe("/today");
  });
});

describe("numbers Sundeck Pro texts and calls", () => {
  it("are US and Canada only", () => {
    expect(isUsNumber("+16025550142")).toBe(true);
    expect(isUsNumber("+14165550123")).toBe(true); // Toronto
    expect(isUsNumber("+447700900123")).toBe(false); // UK
    expect(isUsNumber("+16025550")).toBe(false);
    expect(isUsNumber("+11025550142")).toBe(false); // no area code starts with 1
    expect(isUsNumber(null)).toBe(false);
  });
});
