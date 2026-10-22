import { describe, expect, it } from "vitest";
import {
  REPAIR_CUSTOM,
  REPAIR_LABELS,
  addRepairWrites,
  checkRepairDraft,
  checkRepairDrafts,
  jobRepairLines,
  pickRepair,
  removeRepairWrites,
  repairBookingName,
  repairsFee,
  repairsTotal,
  type JobRepair,
} from "../src";

// Repair jobs hold several repairs (owner, 2026-10-22: "we need a button to 'add additional
// repair'").

const items = [
  { id: "pump", name: "Pump motor", cents: 45000 },
  { id: "igniter", name: "Heater igniter", cents: 18500 },
];
const job = { id: "j1", type: "repair", fee_cents: 45000, intake: { repair_item: "Pump motor" } };
const row = (over: Partial<JobRepair>): JobRepair => ({
  id: "r1",
  job_id: "j1",
  description: "Pump motor",
  price_cents: 45000,
  sort_order: 0,
  ...over,
});

describe("jobRepairLines", () => {
  it("shows a job booked before repairs were rows as its one repair, by the job's id", () => {
    expect(jobRepairLines(job, [])).toEqual([
      {
        id: "j1",
        description: "Pump motor",
        price_cents: 45000,
        price_book_item_id: null,
        booked: true,
      },
    ]);
    expect(jobRepairLines({ ...job, intake: null }, [])[0]!.description).toBe("Repair");
    expect(jobRepairLines({ ...job, fee_cents: null, intake: null }, [])).toEqual([]);
  });

  it("lists live rows in order once there are any, and only on repair jobs", () => {
    const rows = [
      row({ id: "b", sort_order: 1, description: "Heater igniter", price_cents: 18500 }),
      row({ id: "a", sort_order: 0 }),
      row({ id: "gone", sort_order: 2, deleted_at: "2026-10-22T00:00:00Z" }),
      row({ id: "other", job_id: "j2" }),
    ];
    expect(jobRepairLines(job, rows).map((l) => l.id)).toEqual(["a", "b"]);
    expect(repairsTotal(jobRepairLines(job, rows))).toBe(63500);
    expect(jobRepairLines({ ...job, type: "detection" }, rows)).toEqual([]);
    // Every repair removed: none, not the booking again.
    expect(jobRepairLines(job, [row({ deleted_at: "2026-10-22T00:00:00Z" })])).toEqual([]);
  });
});

describe("checkRepairDraft", () => {
  it("names a repair from the item picked, else what was typed, else Repair", () => {
    expect(
      checkRepairDraft({ pick: "pump", description: "", price: "450.00" }, items).repair,
    ).toEqual({
      price_book_item_id: "pump",
      description: "Pump motor",
      price_cents: 45000,
    });
    expect(
      checkRepairDraft({ pick: REPAIR_CUSTOM, description: " Skimmer lid ", price: "25" }, items)
        .repair,
    ).toEqual({ price_book_item_id: null, description: "Skimmer lid", price_cents: 2500 });
    expect(
      checkRepairDraft({ pick: "", description: "", price: "99" }, items).repair?.description,
    ).toBe("Repair");
    // No price book: the description is typed.
    expect(
      checkRepairDraft({ pick: "", description: "Light", price: "80" }, []).repair?.description,
    ).toBe("Light");
  });

  it("asks for what's missing, and leaves a blank row out unless one is required", () => {
    expect(checkRepairDraft({ pick: "", description: "", price: "" }, items)).toEqual({
      repair: null,
      errors: {},
    });
    expect(checkRepairDraft({ pick: "", description: "", price: "" }, items, true).errors).toEqual({
      description: "Pick a repair or describe it.",
    });
    expect(
      checkRepairDraft({ pick: REPAIR_CUSTOM, description: "", price: "20" }, items).errors,
    ).toEqual({
      description: "Describe the repair.",
    });
    expect(checkRepairDraft({ pick: "pump", description: "", price: "" }, items).errors).toEqual({
      price: "Enter a price like 185.",
    });
    expect(
      checkRepairDraft({ pick: "pump", description: "", price: "-5" }, items).errors.price,
    ).toBe("Enter a price like 185.");
  });
});

describe("New Job › Repair", () => {
  it("picks fill the price, and the job's price is the sum", () => {
    const first = pickRepair({ pick: "", description: "", price: "" }, "pump", items);
    expect(first.price).toBe("450.00");
    expect(pickRepair(first, REPAIR_CUSTOM, items).price).toBe("450.00");
    const second = pickRepair({ pick: "", description: "", price: "" }, "igniter", items);
    const blank = { pick: "", description: "", price: "" };
    const checked = checkRepairDrafts([first, blank, second], items);
    expect(checked.ok).toBe(true);
    expect(checked.repairs.map((r) => r.description)).toEqual(["Pump motor", "Heater igniter"]);
    expect(repairsFee(checked.repairs)).toBe(63500);
    expect(repairBookingName(checked.repairs)).toBe("Pump motor, Heater igniter");
    expect(repairsFee([])).toBeNull();
    expect(repairBookingName([])).toBeNull();
    expect(checkRepairDrafts([{ pick: "pump", description: "", price: "x" }], items).ok).toBe(
      false,
    );
  });
});

describe("adding and removing on the job", () => {
  const add = { price_book_item_id: "igniter", description: "Heater igniter", price_cents: 18500 };

  it("writes the booked repair as a row (the job's id) before the first added one", () => {
    expect(addRepairWrites(job, [], add)).toEqual({
      writes: [
        {
          kind: "insert",
          id: "j1",
          values: {
            job_id: "j1",
            price_book_item_id: null,
            description: "Pump motor",
            price_cents: 45000,
            sort_order: 0,
          },
        },
        { kind: "insert", values: { job_id: "j1", ...add, sort_order: 1 } },
      ],
      fee_cents: 63500,
    });
  });

  it("adds after the last row, counting removed ones", () => {
    const rows = [
      row({ id: "a" }),
      row({ id: "b", sort_order: 4, deleted_at: "2026-10-22T00:00:00Z" }),
    ];
    expect(addRepairWrites(job, rows, add)).toEqual({
      writes: [{ kind: "insert", values: { job_id: "j1", ...add, sort_order: 5 } }],
      fee_cents: 63500,
    });
  });

  it("removes a row, or writes the booked one removed", () => {
    const now = "2026-10-22T18:00:00Z";
    expect(removeRepairWrites(job, [row({ id: "a" })], "a", now)).toEqual({
      writes: [{ kind: "update", id: "a", values: { deleted_at: now } }],
      fee_cents: 0,
    });
    const booked = removeRepairWrites(job, [], "j1", now);
    expect(booked.fee_cents).toBe(0);
    expect(booked.writes).toEqual([
      {
        kind: "insert",
        id: "j1",
        values: {
          job_id: "j1",
          price_book_item_id: null,
          description: "Pump motor",
          price_cents: 45000,
          sort_order: 0,
          deleted_at: now,
        },
      },
    ]);
    expect(removeRepairWrites(job, [], "nope", now).writes).toEqual([]);
  });

  it("uses the owner's words", () => {
    expect(REPAIR_LABELS.add).toBe("Add Additional Repair");
    expect(REPAIR_LABELS.section).toBe("Repairs");
  });
});
