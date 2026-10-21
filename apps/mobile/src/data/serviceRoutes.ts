import { useMemo } from "react";
import type { JsonValue } from "@leakbook/sync";
import { getServices } from "../lib/services";
import { routeCards, type PlanPlace, type PlanRow, type PlanWrite } from "../lib/serviceRoutes";
import { useRows } from "./hooks";

// Routes on Schedule (owner, 2026-10-20, docs/plans/route-maps.md part 3): the plans from the
// phone's database, and saving their day and tech through the sync layer (row and outbox in one
// go). The server re-makes each plan's coming visits when the change syncs
// (app.service_plan_changed), as it does for the website's setServiceDay.

/** The shop's running plans as Routes cards, and the rows behind them (for moves and Undo). */
export function useRoutePlans(companyId: string, today: string) {
  const plans = useRows<PlanRow>("service_plan", companyId);
  const customers = useRows<{ id: string; name?: string | null; deleted_at?: string | null }>(
    "customer",
    companyId,
  );
  const properties = useRows<PlanPlace & { id: string }>("property", companyId);
  return useMemo(() => {
    const cards = routeCards({
      plans,
      customers: new Map(customers.map((c) => [c.id, c])),
      properties: new Map(properties.map((p) => [p.id, p])),
      today,
    });
    return { cards, rows: new Map(plans.map((p) => [p.id, p])) };
  }, [plans, customers, properties, today]);
}

/** Save plans' days and techs, all or none. */
export function savePlanDays(companyId: string, rows: PlanWrite[]) {
  const { sync } = getServices();
  sync.batch(() => {
    for (const { id, ...values } of rows)
      sync.write("service_plan", id, companyId, values as Record<string, JsonValue>);
  });
}
