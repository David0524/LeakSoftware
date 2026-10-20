import { workDay } from "@leakbook/core";
import { loadRouteCustomers } from "@/app/actions/service-days";
import { MapProviderScope } from "@/components/map-provider-scope";
import { ServiceRoutes } from "@/components/service-routes";
import { mapsConfigured, resolveMapProvider } from "@/lib/map-provider";
import type { Office } from "@/lib/auth";
import { getTeam } from "@/lib/data";
import { routeContext } from "@/server/route-days";

/**
 * Schedule › Routes (owners and admins; owner, 2026-10-20, docs/plans/route-maps.md part 3):
 * which weekday each pool customer is serviced on, and by whom.
 */
export async function RoutesView({ office, tech }: { office: Office; tech: string | null }) {
  const [ctx, team, plans] = await Promise.all([
    routeContext(office),
    getTeam(office),
    loadRouteCustomers(),
  ]);
  const techs = team
    .filter((t) => t.status === "active")
    // The signed-in person first, as on the rest of Schedule.
    .sort((a, b) => Number(b.user_id === office.user.id) - Number(a.user_id === office.user.id))
    .map((t) => ({ id: t.user_id, name: t.name }));
  return (
    <MapProviderScope provider={resolveMapProvider()}>
      <ServiceRoutes
        plans={plans}
        techs={techs}
        workDays={ctx.settings.workDays}
        workDay={workDay(ctx.settings)}
        depot={ctx.depot}
        maps={mapsConfigured() ? { company: office.company.id } : null}
        initialTech={tech}
      />
    </MapProviderScope>
  );
}
