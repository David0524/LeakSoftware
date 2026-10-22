import { describe, expect, it } from "vitest";
import {
  MAX_SWIPE_ACTIONS,
  checklistRowActions,
  conversationRowActions,
  customerRowActions,
  editRowActions,
  invoiceRowActions,
  jobCompletable,
  jobRowActions,
  mediaRowActions,
  menuTitle,
  reportRowActions,
  routePlanRowActions,
  stopRowActions,
  swipeList,
  toggleLock,
  type RowActions,
} from "../src/lib/rowActions";

// Swipe actions and touch-and-hold menus on every list (owner, 2026-10-20;
// docs/design/2026-10-20-gestures.md section 12).

const ids = (a: RowActions) => ({
  leading: a.leading?.id ?? null,
  trailing: a.trailing.map((x) => x.id),
  menu: a.menu.map((x) => x.id),
});
const labels = (list: { label: string }[]) => list.map((x) => x.label);

/** The spec's rules, for every row a list can produce. */
function followsRules(a: RowActions) {
  expect(a.trailing.length).toBeLessThanOrEqual(MAX_SWIPE_ACTIONS);
  // Nothing destructive on the leading side, ever.
  expect(a.leading?.destructive ?? false).toBe(false);
  // Destructive menu items ask first: their label ends in an ellipsis.
  for (const m of a.menu) if (m.destructive) expect(m.label.endsWith("…")).toBe(true);
  // Title Case labels (each word capitalized, small words aside).
  for (const m of [...a.menu, ...swipeList(a)])
    for (const w of m.label.replace("…", "").split(" "))
      if (!["a", "as", "in", "on", "of"].includes(w)) expect(w[0]).toBe(w[0]!.toUpperCase());
}

describe("Jobs", () => {
  const job = {
    status: "scheduled",
    type: "maintenance",
    phone: "602-555-0100",
    hasAddress: true,
    reschedulable: true,
  };

  it("swipes left for Call and Directions, right for Mark Complete, holds for the rest", () => {
    const a = jobRowActions(job);
    expect(ids(a)).toEqual({
      leading: "complete",
      trailing: ["call", "directions"],
      menu: ["open", "call", "message", "directions", "move"],
    });
    expect(a.leading?.short).toBe("Complete");
    expect(labels(a.menu)).toEqual(["Open", "Call", "Message", "Directions", "Move…"]);
    followsRules(a);
  });

  it("offers Mark Complete only where the job page's Complete Job is (open visits)", () => {
    expect(jobCompletable({ status: "scheduled", type: "maintenance" })).toBe(true);
    expect(jobCompletable({ status: "in_progress", type: "maintenance" })).toBe(true);
    expect(jobCompletable({ status: "done", type: "maintenance" })).toBe(false);
    // Leak detection keeps its pipeline: no Complete Job on its page.
    expect(jobCompletable({ status: "in_progress", type: "detection" })).toBe(false);
    expect(jobRowActions({ ...job, status: "done" }).leading).toBeNull();
  });

  it("leaves out what the row can't do", () => {
    const a = jobRowActions({ ...job, phone: null, hasAddress: false, reschedulable: false });
    expect(ids(a).trailing).toEqual([]);
    expect(ids(a).menu).toEqual(["open"]);
    expect(ids(jobRowActions({ ...job, status: "canceled" })).menu).not.toContain("move");
  });
});

describe("Schedule cards and Needs a Time", () => {
  const stop = { status: "scheduled", lock: "none" as const, scheduled: true, hasAddress: true };

  it("swipes left for Move…, right for Lock…, holds for the rest", () => {
    const a = stopRowActions(stop);
    expect(ids(a)).toEqual({
      leading: "lock",
      trailing: ["move"],
      menu: ["open", "move", "lockDay", "lockTime", "unschedule", "directions"],
    });
    expect(labels(a.menu)).toEqual([
      "Open",
      "Move…",
      "Lock Day",
      "Lock Time",
      "Take Off Schedule",
      "Directions",
    ]);
    followsRules(a);
  });

  it("says Unlock for what's locked, and Locked on the swipe", () => {
    const a = stopRowActions({ ...stop, lock: "both" });
    expect(labels(a.menu)).toContain("Unlock Day");
    expect(labels(a.menu)).toContain("Unlock Time");
    expect(a.leading?.short).toBe("Locked");
  });

  it("takes only an unstarted, scheduled job off the schedule", () => {
    expect(ids(stopRowActions({ ...stop, status: "in_progress" })).menu).not.toContain(
      "unschedule",
    );
    expect(ids(stopRowActions({ ...stop, scheduled: false })).menu).not.toContain("unschedule");
  });

  it("gives Needs a Time's cards Suggest Times, as their … menu", () => {
    expect(ids(stopRowActions({ ...stop, scheduled: false, tray: true })).menu).toEqual([
      "open",
      "suggest",
      "move",
      "lockDay",
      "lockTime",
      "directions",
    ]);
  });

  it("a canceled job only opens and gets directions", () => {
    const a = stopRowActions({ ...stop, status: "canceled" });
    expect(ids(a)).toEqual({ leading: null, trailing: [], menu: ["open", "directions"] });
  });

  it("toggles one part of a lock", () => {
    expect(toggleLock("none", "day")).toBe("day");
    expect(toggleLock("day", "time")).toBe("both");
    expect(toggleLock("both", "day")).toBe("time");
    expect(toggleLock("time", "time")).toBe("none");
  });
});

describe("Messages", () => {
  it("swipes left for Read or Unread, right for Call, holds for the rest", () => {
    const a = conversationRowActions({ unread: true, canCall: true, customerId: "c1" });
    expect(ids(a)).toEqual({
      leading: "call",
      trailing: ["toggle"],
      menu: ["open", "call", "toggle", "customer"],
    });
    expect(a.trailing[0]?.short).toBe("Read");
    expect(labels(a.menu)).toEqual(["Open", "Call", "Mark Read", "Open Customer"]);
    followsRules(a);
  });

  it("has no Call without the company number, and no Open Customer for a stranger", () => {
    const a = conversationRowActions({ unread: false, canCall: false, customerId: null });
    expect(a.leading).toBeNull();
    expect(labels(a.menu)).toEqual(["Open", "Mark Unread"]);
  });
});

describe("Customers", () => {
  it("swipes left for Call and Message, holds for Open, Call, Message and Directions", () => {
    const a = customerRowActions({ phone: "602-555-0100", hasPoolAddress: true });
    expect(ids(a)).toEqual({
      leading: null,
      trailing: ["call", "message"],
      menu: ["open", "call", "message", "directions"],
    });
    followsRules(a);
    expect(ids(customerRowActions({ phone: null, hasPoolAddress: false }))).toEqual({
      leading: null,
      trailing: [],
      menu: ["open"],
    });
  });
});

describe("Invoices", () => {
  const sent = { status: "sent", balanceCents: 64900, role: "owner", hasPayments: false };

  it("swipes right for Record Payment on an unpaid invoice, holds for the card's actions", () => {
    const a = invoiceRowActions({ ...sent, hasLink: true });
    expect(ids(a)).toEqual({
      leading: "record",
      trailing: [],
      menu: ["open", "share", "record", "void"],
    });
    expect(a.menu.find((m) => m.id === "void")?.destructive).toBe(true);
    followsRules(a);
  });

  it("follows the card: no Void once paid, techs record but never void, nothing on a draft", () => {
    expect(
      ids(invoiceRowActions({ ...sent, hasPayments: true, hasLink: false })).menu,
    ).not.toContain("void");
    // Techs record payments too (owner, 2026-10-22).
    expect(ids(invoiceRowActions({ ...sent, role: "tech", hasLink: false }))).toEqual({
      leading: "record",
      trailing: [],
      menu: ["open", "record"],
    });
    expect(ids(invoiceRowActions({ ...sent, role: null, hasLink: false })).menu).toEqual(["open"]);
    expect(ids(invoiceRowActions({ ...sent, status: "draft", hasLink: true })).menu).toEqual([
      "open",
    ]);
    const paid = invoiceRowActions({ ...sent, status: "paid", balanceCents: 0, hasLink: true });
    expect(paid.leading).toBeNull();
  });

  it("offers Send Receipt once a payment is received, to anyone who sees the invoice", () => {
    const partly = { ...sent, status: "partially_paid", hasPayments: true, hasReceipt: true };
    expect(ids(invoiceRowActions({ ...partly, hasLink: true })).menu).toEqual([
      "open",
      "share",
      "record",
      "receipt",
    ]);
    expect(ids(invoiceRowActions({ ...partly, role: "tech", hasLink: false })).menu).toEqual([
      "open",
      "record",
      "receipt",
    ]);
    expect(
      ids(invoiceRowActions({ ...partly, status: "void", hasLink: false })).menu,
    ).not.toContain("receipt");
  });
});

describe("Reports, settings lists, findings, photos", () => {
  it("reports hold for Open", () => {
    expect(ids(reportRowActions())).toEqual({ leading: null, trailing: [], menu: ["open"] });
  });

  it("settings rows and findings hold for Edit and their own delete, which asks", () => {
    const a = editRowActions({ deleteLabel: "Remove Test Type" });
    expect(labels(a.menu)).toEqual(["Edit", "Remove Test Type…"]);
    expect(a.trailing[0]?.short).toBe("Remove");
    followsRules(a);
    // Rows without a delete (checklist items in Settings) get Edit only.
    expect(labels(editRowActions({}).menu)).toEqual(["Edit"]);
  });

  it("photos hold for Mark Up and Delete; videos and voice notes for Delete", () => {
    const photo = mediaRowActions({
      kind: "photo",
      kindLabel: "Photo",
      hasMarkup: false,
      ready: true,
    });
    expect(labels(photo.menu)).toEqual(["Mark Up", "Delete Photo…"]);
    followsRules(photo);
    expect(
      labels(
        mediaRowActions({ kind: "photo", kindLabel: "Photo", hasMarkup: true, ready: true }).menu,
      ),
    ).toEqual(["Edit Markup", "Delete Photo…"]);
    expect(
      labels(
        mediaRowActions({ kind: "video", kindLabel: "Video", hasMarkup: false, ready: true }).menu,
      ),
    ).toEqual(["Delete Video…"]);
  });
});

describe("Checklist rows", () => {
  const visit = [
    { value: "ok", label: "Done" },
    { value: "attention", label: "Needs Attention" },
    { value: "na", label: "Skipped" },
  ];

  it("swipes right for Done; holds for every answer and Not Done", () => {
    const a = checklistRowActions(visit, "attention");
    expect(a.leading?.label).toBe("Done");
    expect(labels(a.menu)).toEqual(["Done", "Needs Attention", "Skipped", "Not Done"]);
    expect(a.menu.find((m) => m.checked)?.label).toBe("Needs Attention");
    followsRules(a);
  });

  it("has no swipe once it's Done, and no Not Done while it's to do", () => {
    expect(checklistRowActions(visit, "ok").leading).toBeNull();
    expect(labels(checklistRowActions(visit, null).menu)).not.toContain("Not Done");
  });
});

describe("Routes: customers", () => {
  it("holds for Change Day… and Change Tech…, only when the card can move", () => {
    expect(labels(routePlanRowActions(true).menu)).toEqual(["Change Day…", "Change Tech…"]);
    expect(routePlanRowActions(false).menu).toEqual([]);
  });
});

describe("menu titles", () => {
  it("are the row's name, with its number", () => {
    expect(menuTitle("Lebron James", "#1042")).toBe("Lebron James · #1042");
    expect(menuTitle(" ", null)).toBe("Customer");
  });
});
