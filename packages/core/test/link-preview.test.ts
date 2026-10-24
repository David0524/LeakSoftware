import { describe, expect, it } from "vitest";
import {
  customerLinkToken,
  linkPreview,
  linkPreviewVersion,
  splitShareMessage,
  type LinkPreviewRow,
} from "../src";

const NOW = new Date("2026-10-24T16:00:00Z");
const SHOP = {
  live: true,
  shop: "Blue Wave Pools",
  logo_path: "c1/logo-1.png",
  timezone: "America/New_York",
};
const quote: LinkPreviewRow = {
  ...SHOP,
  kind: "quote",
  number: 1042,
  status: "sent",
  total_cents: 124000,
  valid_until: "2026-11-15",
  sent_at: "2026-10-24T14:00:00+00:00",
  customer: "Dana Ruiz",
  address: "123 Palm Ave, Tampa, FL 33601",
};
const invoice: LinkPreviewRow = {
  ...SHOP,
  kind: "invoice",
  number: 2088,
  status: "sent",
  total_cents: 124000,
  balance_cents: 124000,
  due_date: "2026-11-15",
  sent_at: "2026-10-24T14:00:00+00:00",
  customer: "Dana Ruiz",
  address: "123 Palm Ave, Tampa, FL 33601",
};
const report: LinkPreviewRow = {
  ...SHOP,
  kind: "report",
  status: "sent",
  template_key: "homeowner",
  version: 1,
  job_type: "leak_detection",
  sent_at: "2026-10-24T15:00:00+00:00",
  customer: "Dana Ruiz",
  address: "123 Palm Ave, Tampa, FL 33601",
  visit_at: "2026-10-24T13:30:00+00:00",
};

describe("linkPreview", () => {
  it("names a quote for its customer, with the total", () => {
    const p = linkPreview(quote, NOW);
    expect(p.title).toBe("Blue Wave Pools: Quote for Dana Ruiz");
    expect(p.description).toBe("$1,240.00 · Good through Nov 15");
    expect(p.card).toMatchObject({
      tone: "document",
      logoPath: "c1/logo-1.png",
      docType: "Quote",
      headline: "$1,240.00",
      money: true,
    });
  });

  it("says when a quote was accepted or declined instead of its date", () => {
    expect(linkPreview({ ...quote, status: "accepted" }, NOW).description).toBe(
      "$1,240.00 · Accepted",
    );
    expect(linkPreview({ ...quote, status: "declined" }, NOW).description).toBe(
      "$1,240.00 · Declined",
    );
  });

  it("names the address when there's no customer", () => {
    expect(linkPreview({ ...quote, customer: null }, NOW).title).toBe(
      "Blue Wave Pools: Quote for 123 Palm Ave",
    );
    expect(linkPreview({ ...quote, customer: null, address: null }, NOW).title).toBe(
      "Blue Wave Pools: Quote",
    );
  });

  it("shows an invoice's amount and due date", () => {
    const p = linkPreview(invoice, NOW);
    expect(p.title).toBe("Blue Wave Pools: Invoice for Dana Ruiz");
    expect(p.description).toBe("$1,240.00 · Due Nov 15");
    expect(p.card).toMatchObject({
      docType: "Invoice",
      headline: "$1,240.00",
      caption: "Due Nov 15",
    });
  });

  it("reads due on receipt when due the day it was sent, as the page does", () => {
    expect(linkPreview({ ...invoice, due_date: "2026-10-24" }, NOW).description).toBe(
      "$1,240.00 · Due on receipt",
    );
  });

  it("leads with the balance once part is paid, and says paid in full when it is", () => {
    const part = linkPreview({ ...invoice, status: "partially_paid", balance_cents: 60000 }, NOW);
    expect(part.description).toBe("$600.00 balance · Due Nov 15");
    expect(part.card.headline).toBe("$600.00");
    expect(part.card.caption).toBe("Balance due · Due Nov 15");
    const paid = linkPreview({ ...invoice, status: "paid", balance_cents: 0 }, NOW);
    expect(paid.description).toBe("$1,240.00 · Paid in full");
    expect(paid.card.caption).toBe("Paid in full");
  });

  it("adds the year to a date outside this year", () => {
    expect(linkPreview({ ...invoice, due_date: "2027-01-05" }, NOW).description).toBe(
      "$1,240.00 · Due Jan 5, 2027",
    );
  });

  it("names each kind of report as the owner listed them", () => {
    expect(linkPreview(report, NOW).title).toBe(
      "Blue Wave Pools: Leak Detection Report for Dana Ruiz",
    );
    expect(linkPreview({ ...report, template_key: "partner" }, NOW).card.docType).toBe(
      "Leak Detection Report",
    );
    expect(linkPreview({ ...report, template_key: "maintenance" }, NOW).card.docType).toBe(
      "Maintenance Visit Report",
    );
    expect(linkPreview({ ...report, job_type: "inspection" }, NOW).card.docType).toBe(
      "Pool Inspection Report",
    );
  });

  it("shows a report's address and visit date, in the shop's time zone", () => {
    const p = linkPreview({ ...report, visit_at: "2026-10-24T02:00:00+00:00" }, NOW);
    expect(p.description).toBe("Visit on Oct 23 · 123 Palm Ave");
    expect(p.card).toMatchObject({
      headline: "123 Palm Ave",
      caption: "Visit on Oct 23 · Tampa, FL 33601",
      money: false,
    });
  });

  it("reads Postgres timestamps too", () => {
    expect(linkPreview({ ...report, visit_at: "2026-10-24 15:00:00+00" }, NOW).description).toBe(
      "Visit on Oct 24 · 123 Palm Ave",
    );
  });

  it("gives a link that stopped working the shop's name only", () => {
    const p = linkPreview({ kind: "invoice", live: false, shop: "Blue Wave Pools" }, NOW);
    expect(p.title).toBe("Blue Wave Pools: This document is no longer available");
    expect(p.card).toEqual({
      tone: "neutral",
      shop: "Blue Wave Pools",
      logoPath: null,
      docType: null,
      headline: "This document is no longer available",
      caption: null,
      money: false,
    });
  });

  it("treats expired quotes, canceled invoices and updated reports as their pages do", () => {
    for (const row of [
      { ...quote, status: "expired" },
      { ...invoice, status: "void" },
    ]) {
      const p = linkPreview(row, NOW);
      expect(p.card.tone).toBe("neutral");
      expect(p.card.headline).toBe("This document is no longer available");
    }
    const updated = linkPreview({ ...report, status: "superseded" }, NOW);
    expect(updated.card.tone).toBe("neutral");
    expect(updated.title).toBe("Blue Wave Pools: This report was updated");
  });

  it("never shows anything but the shop on a neutral card", () => {
    for (const row of [
      { ...quote, status: "expired" },
      { ...invoice, status: "void" },
      { ...report, status: "superseded" },
      { ...report, live: false },
    ]) {
      const text = JSON.stringify(linkPreview(row, NOW));
      for (const secret of ["Dana", "Palm", "1,240", "c1/logo", "Oct", "Nov"])
        expect(text).not.toContain(secret);
    }
  });

  it("puts no phone number or email in a preview, even if the row carried one", () => {
    const leaky = {
      ...quote,
      phone: "(813) 555-0199",
      email: "dana@example.com",
      lines: [{ description: "Replace return fitting" }],
    } as LinkPreviewRow;
    const text = JSON.stringify(linkPreview(leaky, NOW));
    expect(text).not.toContain("555");
    expect(text).not.toContain("@");
    expect(text).not.toContain("fitting");
  });

  it("changes its version whenever the card would change", () => {
    const a = linkPreviewVersion(linkPreview(invoice, NOW));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(linkPreviewVersion(linkPreview(invoice, NOW))).toBe(a);
    expect(linkPreviewVersion(linkPreview({ ...invoice, status: "paid" }, NOW))).not.toBe(a);
    expect(linkPreviewVersion(linkPreview({ ...invoice, live: false }, NOW))).not.toBe(a);
  });
});

describe("splitShareMessage", () => {
  it("separates the words from the link at the end", () => {
    expect(
      splitShareMessage(
        "Blue Wave Pools: your invoice. View and pay it here: https://sundeckpro.com/i/abc",
      ),
    ).toEqual({
      text: "Blue Wave Pools: your invoice. View and pay it here:",
      url: "https://sundeckpro.com/i/abc",
    });
    expect(splitShareMessage("https://sundeckpro.com/r/abc")).toEqual({
      text: "",
      url: "https://sundeckpro.com/r/abc",
    });
    expect(splitShareMessage("No link here.")).toEqual({ text: "No link here.", url: null });
  });
});

describe("customerLinkToken", () => {
  it("finds the token of a quote, invoice or report link", () => {
    const t = "0123456789abcdef0123456789abcdef";
    expect(customerLinkToken(`https://sundeckpro.com/q/${t}`)).toBe(t);
    expect(customerLinkToken(`http://localhost:3000/r/${t}?print=1`)).toBe(t);
    expect(customerLinkToken(`https://sundeckpro.com/invite/${t}`)).toBeNull();
  });
});
