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
  type JobRepair,
  type RepairDraft,
  type RepairItem,
  type RepairJob,
  type RepairValues,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// repairs.ts (owner, 2026-10-22: "add additional repair"): a repair job's repairs.

const items: RepairItem[] = [
  { id: "pump", name: "Pump motor", cents: 45000 },
  { id: "igniter", name: "Heater igniter", cents: 18500 },
];
const booked: RepairJob = {
  id: "j1",
  type: "repair",
  fee_cents: 45000,
  intake: { repair_item: "Pump motor" },
};
const priceOnly: RepairJob = { id: "j1", type: "repair", fee_cents: 9900, intake: null };
const bare: RepairJob = { id: "j1", type: "repair", fee_cents: null, intake: null };
const leak: RepairJob = { ...booked, type: "detection" };
const r = (id: string, o: Partial<JobRepair> = {}): JobRepair => ({
  id,
  job_id: "j1",
  price_book_item_id: null,
  description: "Pump motor",
  price_cents: 45000,
  sort_order: 0,
  created_at: "2026-10-22T15:00:00Z",
  deleted_at: null,
  ...o,
});
const rows: JobRepair[] = [
  r("b", {
    sort_order: 1,
    description: "Heater igniter",
    price_cents: 18500,
    price_book_item_id: "igniter",
  }),
  r("a"),
  r("c", {
    sort_order: 1,
    created_at: "2026-10-22T14:00:00Z",
    description: "Skimmer lid",
    price_cents: 2500,
  }),
  r("gone", { sort_order: 3, deleted_at: "2026-10-22T16:00:00Z" }),
  r("other", { job_id: "j2" }),
];
const removedAll: JobRepair[] = [r("a", { deleted_at: "2026-10-22T16:00:00Z" })];
const d = (pick: string, description: string, price: string): RepairDraft => ({
  pick,
  description,
  price,
});
const add: RepairValues = {
  price_book_item_id: "igniter",
  description: "Heater igniter",
  price_cents: 18500,
};
const NOW = "2026-10-22T18:00:00Z";

export const repairs: ModuleCases = {
  REPAIR_LABELS: rule(() => ({ ...REPAIR_LABELS, custom_value: REPAIR_CUSTOM }), [[]]),
  jobRepairLines: rule(
    (job: RepairJob, rs: JobRepair[]) => jobRepairLines(job, rs),
    [
      [booked, []],
      [priceOnly, []],
      [bare, []],
      [booked, rows],
      [leak, rows],
      [booked, removedAll],
    ],
  ),
  checkRepairDraft: rule(
    (draft: RepairDraft, its: RepairItem[], required: boolean) =>
      checkRepairDraft(draft, its, required),
    [
      [d("pump", "", "450.00"), items, false],
      [d(REPAIR_CUSTOM, " Skimmer lid ", "25"), items, false],
      [d("", "", "99"), items, false],
      [d("", "Light", "80"), [], false],
      [d("", "", ""), items, false],
      [d("", "", ""), items, true],
      [d(REPAIR_CUSTOM, "", "20"), items, false],
      [d(REPAIR_CUSTOM, "", ""), items, true],
      [d("pump", "", ""), items, false],
      [d("pump", "", "-5"), items, false],
      [d("pump", "", "abc"), items, false],
      [d("", "x".repeat(201), "5"), [], false],
      [d("missing", "", "12"), items, false],
    ],
  ),
  checkRepairDrafts: rule(
    (drafts: RepairDraft[], its: RepairItem[]) => checkRepairDrafts(drafts, its),
    [
      [[d("pump", "", "450.00"), d("", "", ""), d("igniter", "", "185.00")], items],
      [[d("pump", "", "x"), d(REPAIR_CUSTOM, "Lid", "")], items],
      [[], items],
    ],
  ),
  pickRepair: rule(
    (draft: RepairDraft, pick: string, its: RepairItem[]) => pickRepair(draft, pick, its),
    [
      [d("", "", ""), "pump", items],
      [d("pump", "", "450.00"), REPAIR_CUSTOM, items],
      [d("pump", "Lid", "12"), "", items],
    ],
  ),
  repairBookingName: rule(
    (rs: RepairValues[]) => repairBookingName(rs),
    [[[add, { ...add, description: "Lid" }]], [[]]],
  ),
  repairsFee: rule(
    (rs: RepairValues[]) => repairsFee(rs),
    [[[add, { ...add, price_cents: 100 }]], [[]]],
  ),
  addRepairWrites: rule(
    (job: RepairJob, rs: JobRepair[], repair: RepairValues) => addRepairWrites(job, rs, repair),
    [
      [booked, [], add],
      [booked, rows, add],
      [bare, [], add],
      [booked, removedAll, add],
    ],
  ),
  removeRepairWrites: rule(
    (job: RepairJob, rs: JobRepair[], id: string, now: string) =>
      removeRepairWrites(job, rs, id, now),
    [
      [booked, [], "j1", NOW],
      [booked, rows, "b", NOW],
      [booked, rows, "nope", NOW],
      [priceOnly, [], "j1", NOW],
    ],
  ),
};
