import { describe, expect, it } from "vitest";
import { REFER_COPY, referShareMessage, referralLink, showsReferRow } from "../src";

describe("Refer a Pool Company", () => {
  it("builds the sign-up link from the website and the shop's code", () => {
    expect(referralLink("https://sundeckpro.com", "BLUEWAVEPOOLS")).toBe(
      "https://sundeckpro.com/sign-up?code=BLUEWAVEPOOLS",
    );
    expect(referralLink("https://sundeckpro.com/", " bluewave-pools ")).toBe(
      "https://sundeckpro.com/sign-up?code=BLUEWAVEPOOLS",
    );
    expect(referralLink("https://sundeckpro.com", "")).toBe("");
    expect(referralLink("https://sundeckpro.com", null)).toBe("");
    expect(referralLink(null, "BLUEWAVEPOOLS")).toBe("");
  });

  it("shares the words, then the link", () => {
    expect(referShareMessage("https://sundeckpro.com/sign-up?code=BLUEWAVEPOOLS")).toBe(
      "Try Sundeck Pro for your pool business: https://sundeckpro.com/sign-up?code=BLUEWAVEPOOLS",
    );
  });

  it("shows the row to owners with a code only", () => {
    expect(showsReferRow("owner", "BLUEWAVEPOOLS")).toBe(true);
    expect(showsReferRow("admin", "BLUEWAVEPOOLS")).toBe(false);
    expect(showsReferRow("tech", "BLUEWAVEPOOLS")).toBe(false);
    expect(showsReferRow("owner", null)).toBe(false);
    expect(showsReferRow("owner", "  ")).toBe(false);
    expect(showsReferRow(undefined, "BLUEWAVEPOOLS")).toBe(false);
  });

  it("never mentions money, a trial or subscribing (App Store rules 3.1.1 and 3.1.3(f))", () => {
    const words = [
      ...Object.values(REFER_COPY),
      referShareMessage("https://sundeckpro.com/sign-up?code=X"),
    ].join(" ");
    expect(words).not.toMatch(/\$|free|month|price|trial|subscri|pay|buy|discount|% off|give a/i);
  });
});
