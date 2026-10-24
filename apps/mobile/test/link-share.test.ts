import { describe, expect, it } from "vitest";
import { linkShareContent } from "../src/lib/linkShareContent";

// Link previews (owner, 2026-10-24): the share sheet gets a customer link so Messages shows the
// document's preview card, with the same title as the website's.

const LINK = "https://sundeckpro.com/i/0123456789abcdef0123456789abcdef";
const TEXT = `Bluefin Pool Co.: your invoice. View and pay it here: ${LINK}`;
const TITLE = "Bluefin Pool Co.: Invoice for Dana Ruiz";

describe("linkShareContent", () => {
  it("gives Android the whole text and the preview's title", () => {
    expect(linkShareContent(TEXT, TITLE, "android")).toEqual({ text: TEXT, title: TITLE });
  });

  it("gives the iPhone the link as a link beside the words", () => {
    expect(linkShareContent(TEXT, TITLE, "ios")).toEqual({
      url: LINK,
      message: "Bluefin Pool Co.: your invoice. View and pay it here:",
    });
    expect(linkShareContent(LINK, TITLE, "ios")).toEqual({ url: LINK });
  });

  it("shares a text without a link as it is, untitled", () => {
    expect(linkShareContent("On our way.", TITLE, "android")).toEqual({
      text: "On our way.",
      title: null,
    });
    expect(linkShareContent("On our way.", null, "ios")).toEqual({
      text: "On our way.",
      title: null,
    });
  });
});
