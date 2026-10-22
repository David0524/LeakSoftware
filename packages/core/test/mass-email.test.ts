import { describe, expect, it } from "vitest";
import {
  fillFirstName,
  massEmailAudience,
  massEmailConfirm,
  massEmailContent,
  massEmailCountText,
  massEmailErrors,
  massEmailFirstName,
  massEmailHistoryText,
  massEmailLimitText,
  massEmailSendLabel,
  massEmailSentText,
  shopMailingAddress,
} from "../src";

describe("mass email", () => {
  it("reads an audience safely", () => {
    expect(massEmailAudience({ show: "plan", city: "  Mesa  ", days: "30" })).toEqual({
      show: "plan",
      city: "Mesa",
      days: 30,
    });
    expect(massEmailAudience({ show: "x'; drop", days: 12 })).toEqual({
      show: "all",
      city: null,
      days: null,
    });
    expect(massEmailAudience(null)).toEqual({ show: "all", city: null, days: null });
  });

  it("counts in plain words", () => {
    expect(massEmailCountText({ recipients: 42, no_email: 3, unsubscribed: 2 })).toEqual({
      count: "42 customers with an email.",
      skipped: "5 left out: 3 without an email, 2 unsubscribed.",
    });
    expect(massEmailCountText({ recipients: 1, no_email: 0, unsubscribed: 0 })).toEqual({
      count: "1 customer with an email.",
      skipped: null,
    });
    expect(massEmailCountText({ recipients: 0, no_email: 0, unsubscribed: 1 }).skipped).toBe(
      "1 left out: 1 unsubscribed.",
    );
  });

  it("labels the send and its alert", () => {
    expect(massEmailSendLabel(42)).toBe("Send to 42 Customers");
    expect(massEmailSendLabel(1)).toBe("Send to 1 Customer");
    expect(massEmailSendLabel(0)).toBe("Send");
    expect(massEmailConfirm(42, " Fall opening ", "Demo Leak Co.")).toEqual({
      title: "Send to 42 customers?",
      message: "“Fall opening” goes out now from Demo Leak Co. It can’t be unsent.",
      confirmLabel: "Send",
    });
    expect(massEmailSentText(42, 0)).toBe("Sent to 42 customers.");
    expect(massEmailSentText(40, 2)).toBe("Sent to 40 customers. 2 didn’t go.");
    expect(massEmailSentText(0, 3)).toBe("It didn’t go. Check the addresses and try again.");
  });

  it("describes history rows and the daily limit", () => {
    const row = { status: "sent", sent_count: 40, failed_count: 2, recipient_count: 42 };
    expect(massEmailHistoryText(row)).toBe("Sent to 40 · 2 didn’t go");
    expect(massEmailHistoryText({ ...row, failed_count: 0 })).toBe("Sent to 40");
    expect(massEmailHistoryText({ ...row, status: "sending" })).toBe("Sending to 42…");
    expect(massEmailHistoryText({ ...row, status: "failed", sent_count: 0 })).toBe("Didn’t go");
    expect(massEmailLimitText(258)).toBe(
      "Your shop can email 258 more customers today. Narrow the list or send the rest tomorrow.",
    );
    expect(massEmailLimitText(1)).toBe(
      "Your shop can email 1 more customer today. Narrow the list or send the rest tomorrow.",
    );
    expect(massEmailLimitText(0)).toBe(
      "Your shop has reached today’s limit for emailing customers. It resets tomorrow.",
    );
  });

  it("checks the fields", () => {
    expect(massEmailErrors(" ", "")).toEqual({
      subject: "Add a subject.",
      body: "Write a message.",
    });
    expect(massEmailErrors("Hi", "Hello")).toEqual({});
    expect(massEmailErrors("x".repeat(151), "Hello").subject).toMatch(/under 150/);
  });

  it("fills {first name}", () => {
    expect(massEmailFirstName("Rosa Diaz", "homeowner")).toBe("Rosa");
    expect(massEmailFirstName("Blue Pools LLC", "pool_company")).toBe("there");
    expect(massEmailFirstName("  ", "homeowner")).toBe("there");
    expect(massEmailFirstName("Diaz, Rosa", "other")).toBe("Diaz");
    expect(fillFirstName("Hi {first name}, { First  Name }!", "Rosa")).toBe("Hi Rosa, Rosa!");
  });

  it("needs a full mailing address", () => {
    expect(
      shopMailingAddress({
        address_line1: "1 Main St",
        address_line2: "Suite 2",
        city: "Phoenix",
        state: "AZ",
        postal_code: "85001",
      }),
    ).toBe("1 Main St, Suite 2, Phoenix, AZ 85001");
    expect(shopMailingAddress({ address_line1: "1 Main St", city: "Phoenix", state: "AZ" })).toBe(
      null,
    );
  });

  it("builds the email with the shop's address and an unsubscribe link", () => {
    const email = massEmailContent({
      subject: "Fall opening for {first name}",
      body: "Hi {first name},\n\nPools <close> soon.\nCall us.",
      firstName: "Rosa",
      shop: { name: "Demo Leak Co.", address: "1 Main St, Phoenix, AZ 85001" },
      unsubscribeUrl: "https://sundeckpro.com/unsubscribe/abc",
    });
    expect(email.subject).toBe("Fall opening for Rosa");
    expect(email.text).toContain("Hi Rosa,\n\nPools <close> soon.");
    expect(email.text).toContain("Demo Leak Co. · 1 Main St, Phoenix, AZ 85001");
    expect(email.text).toContain("Unsubscribe: https://sundeckpro.com/unsubscribe/abc");
    expect(email.html).toContain("<p>Hi Rosa,</p><p>Pools &#60;close&#62; soon.<br>Call us.</p>");
    expect(email.html).toContain('href="https://sundeckpro.com/unsubscribe/abc"');
    expect(massEmailContent({ ...emailInput(), test: true }).subject).toBe("Test: Hello");
  });
});

function emailInput() {
  return {
    subject: "Hello",
    body: "Hi",
    firstName: "Dana",
    shop: { name: "Shop", address: "1 Main St, Phoenix, AZ 85001" },
    unsubscribeUrl: "https://x/unsubscribe/test",
  };
}
