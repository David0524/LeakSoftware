import { describe, expect, it } from "vitest";
import {
  formatAddress,
  newJobRecords,
  newJobTypes,
  validateNewJob,
  zonedTimeToIso,
  type NewJobInput,
  type Services,
} from "../src";

const blank: NewJobInput = {
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  addressLine1: "",
  city: "",
  state: "",
  postalCode: "",
  scheduleDate: "",
  scheduleTime: "",
};

describe("validateNewJob", () => {
  it("needs a customer and an address", () => {
    expect(validateNewJob(blank)).toEqual({
      customerName: "Enter the customer's name.",
      addressLine1: "Enter the street address.",
    });
  });

  it("accepts an existing customer and property", () => {
    expect(validateNewJob({ ...blank, customerId: "c", propertyId: "p" })).toEqual({});
  });

  it("checks email, date, and time formats", () => {
    const e = validateNewJob({
      ...blank,
      customerName: "M",
      addressLine1: "1 St",
      customerEmail: "nope",
      scheduleDate: "10/12/2026",
      scheduleTime: "9am",
    });
    expect(Object.keys(e).sort()).toEqual(["customerEmail", "scheduleDate", "scheduleTime"]);
  });
});

describe("zonedTimeToIso", () => {
  it("converts shop wall-clock time to an instant", () => {
    expect(zonedTimeToIso("2026-10-14", "09:00", "America/Phoenix")).toBe(
      "2026-10-14T16:00:00.000Z",
    );
    expect(zonedTimeToIso("2026-07-01", "09:00", "America/New_York")).toBe(
      "2026-07-01T13:00:00.000Z",
    );
    expect(zonedTimeToIso("2026-12-01", "09:00", "America/New_York")).toBe(
      "2026-12-01T14:00:00.000Z",
    );
  });

  it("handles the day daylight saving starts", () => {
    expect(zonedTimeToIso("2026-03-08", "12:00", "America/New_York")).toBe(
      "2026-03-08T16:00:00.000Z",
    );
  });
});

describe("formatAddress", () => {
  it("joins the parts that exist", () => {
    expect(
      formatAddress({
        address_line1: "1423 Palm Ct",
        city: "Phoenix",
        state: "AZ",
        postal_code: "85016",
      }),
    ).toBe("1423 Palm Ct, Phoenix, AZ 85016");
    expect(
      formatAddress({ address_line1: "1 Main", city: null, state: null, postal_code: null }),
    ).toBe("1 Main");
  });
});

describe("newJobRecords", () => {
  const input = {
    ...blank,
    customerName: " Maria ",
    customerPhone: "",
    addressLine1: "1423 Palm Ct",
    state: "az",
  };

  it("creates customer, property, and an in-progress job", () => {
    const r = newJobRecords(input, {
      poolType: "vinyl",
      hasSpa: true,
      accessNotes: " gate 4821 ",
      timing: { kind: "now", at: new Date("2026-10-12T17:00:00Z") },
      assignedUserId: "u1",
    });
    expect(r.customer).toEqual({ kind: "homeowner", name: "Maria", phone: null, email: null });
    expect(r.property).toMatchObject({
      address_line1: "1423 Palm Ct",
      state: "AZ",
      has_spa: true,
      access_notes: "gate 4821",
    });
    expect(r.job).toEqual({
      type: "detection",
      assigned_user_id: "u1",
      status: "in_progress",
      started_at: "2026-10-12T17:00:00.000Z",
    });
  });

  it("reuses existing rows and schedules in the shop's time zone", () => {
    const r = newJobRecords(
      { ...input, customerId: "c", propertyId: "p" },
      {
        poolType: null,
        hasSpa: false,
        accessNotes: "",
        timing: {
          kind: "scheduled",
          date: "2026-10-14",
          time: "09:00",
          timeZone: "America/Phoenix",
        },
        assignedUserId: null,
      },
    );
    expect(r.customer).toBeNull();
    expect(r.property).toBeNull();
    expect(r.job).toMatchObject({
      status: "scheduled",
      scheduled_start: "2026-10-14T16:00:00.000Z",
    });
  });
});

describe("newJobTypes", () => {
  const values = (s: Services) => newJobTypes(s).map((t) => t.value);
  it("offers the package's own jobs, then Repair to every shop", () => {
    expect(values("leak")).toEqual(["detection", "inspection", "repair"]);
    expect(values("pool")).toEqual(["maintenance", "repair"]);
    expect(values("both")).toEqual(["detection", "inspection", "maintenance", "repair"]);
  });
});
