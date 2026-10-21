import { scheduleOrderWrites, type ScheduleOrderWrite } from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";

// Reorder Techs (owner, 2026-10-21: "Make a way to reorder techs in the schedule";
// docs/design/2026-10-21-tech-order.md), as the website's reorder-techs.tsx: Done saves each
// tech's place (membership.schedule_order) through the sync layer, row and outbox together, only
// for the places that changed. The order is read with core scheduleOrder.

export interface MembershipStore {
  write(table: string, id: string, companyId: string, values: Record<string, JsonValue>): void;
  batch<T>(fn: () => T): T;
}

/**
 * Saves the order: `ordered` is membership ids top to bottom; `members` the memberships as saved
 * (membership id and place). Returns what was written.
 */
export function saveTechOrder(
  store: MembershipStore,
  companyId: string,
  members: { membership_id: string; schedule_order?: number | null }[],
  ordered: string[],
): ScheduleOrderWrite[] {
  const writes = scheduleOrderWrites(
    members.map((m) => ({ id: m.membership_id, schedule_order: m.schedule_order ?? null })),
    ordered,
  );
  if (writes.length)
    store.batch(() => {
      for (const w of writes)
        store.write("membership", w.id, companyId, { schedule_order: w.schedule_order });
    });
  return writes;
}
