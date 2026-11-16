import { searchShops, shopStanding, shopsCsv } from "@leakbook/core";
import { loadShops, logStaffAction, requireStaff } from "@/server/staff";

/** Staff: the Shops list (as searched and filtered) as a CSV. Logged, since it's contact details. */
export async function GET(request: Request) {
  let staff;
  try {
    ({ staff } = await requireStaff());
  } catch {
    return new Response("Not allowed", { status: 403 });
  }
  const url = new URL(request.url);
  const show = url.searchParams.get("show") ?? "";
  let shops = searchShops(await loadShops(), url.searchParams.get("q") ?? "");
  if (show && show !== "all") shops = shops.filter((s) => shopStanding(s) === show);
  await logStaffAction(staff, "export", { details: { list: "shops", rows: shops.length, show } });
  return new Response(shopsCsv(shops), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="sundeck-shops-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
