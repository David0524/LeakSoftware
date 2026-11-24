import { describe, expect, it } from "vitest";
import { officeLinks, desktopNav, phoneNav } from "@/lib/nav";
import { newQuoteErrors, newQuoteInput, quoteSegmentParam, quotesHref } from "@/lib/quotes";

// Standalone quotes on the website (docs/design/2026-11-24-standalone-quotes.md).

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("the Quotes list's address", () => {
  it("opens on Sent, and keeps another segment and the search", () => {
    expect(quoteSegmentParam(undefined)).toBe("sent");
    expect(quoteSegmentParam("nonsense")).toBe("sent");
    expect(quoteSegmentParam("declined")).toBe("declined");
    expect(quotesHref("sent")).toBe("/quotes");
    expect(quotesHref("draft")).toBe("/quotes?segment=draft");
    expect(quotesHref("accepted", " Ruiz ")).toBe("/quotes?segment=accepted&q=Ruiz");
    expect(quotesHref("sent", "1043")).toBe("/quotes?q=1043");
  });

  it("is in More right after Invoices, on phones and in the desktop menu", () => {
    const links = officeLinks(true, {});
    const more = phoneNav(links).more.map((l) => l.href);
    expect(more.indexOf("/quotes")).toBe(more.indexOf("/invoices") + 1);
    const menu = desktopNav(links).more.map((l) => l.href);
    expect(menu.indexOf("/quotes")).toBe(menu.indexOf("/invoices") + 1);
  });
});

describe("New Quote's form", () => {
  it("reads a new customer with a new address", () => {
    const { input, existing } = newQuoteInput(
      form({
        customer_mode: "new",
        customer_name: "Ana Ruiz",
        customer_phone: "555-0100",
        customer_email: "ana@example.com",
        address_line1: "12 Palm St",
        city: "Tampa",
        state: "fl",
        postal_code: "33602",
      }),
    );
    expect(existing).toBe(false);
    expect(input).toMatchObject({
      customerId: undefined,
      customerName: "Ana Ruiz",
      propertyId: undefined,
      addressLine1: "12 Palm St",
      state: "fl",
    });
    expect(newQuoteErrors(input, existing)).toEqual({});
  });

  it("reads an existing customer and one of their pools, ignoring the address fields", () => {
    const { input, existing } = newQuoteInput(
      form({
        customer_mode: "existing",
        customer: "c1",
        property: "p1",
        customer_name: "left over",
        address_line1: "left over",
      }),
    );
    expect(existing).toBe(true);
    expect(input).toMatchObject({
      customerId: "c1",
      customerName: "",
      propertyId: "p1",
      addressLine1: "",
    });
    expect(newQuoteErrors(input, existing)).toEqual({});
  });

  it("allows no pool at all, and names each problem by its field", () => {
    const blank = newQuoteInput(
      form({ customer_mode: "existing", customer: "c1", property: "new" }),
    );
    expect(blank.input.propertyId).toBeUndefined();
    expect(newQuoteErrors(blank.input, blank.existing)).toEqual({});

    const none = newQuoteInput(form({ customer_mode: "existing" }));
    expect(newQuoteErrors(none.input, none.existing)).toEqual({ customer: "Pick a customer." });

    const bad = newQuoteInput(
      form({ customer_mode: "new", customer_email: "nope", city: "Tampa" }),
    );
    expect(newQuoteErrors(bad.input, bad.existing)).toEqual({
      customer_name: "Enter the customer's name.",
      customer_email: "Check the email address.",
      address_line1: "Enter the street address, or leave the address blank.",
    });
  });
});
