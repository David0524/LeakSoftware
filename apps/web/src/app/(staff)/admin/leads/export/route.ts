import { leadsCsv, type LeadRow } from "@leakbook/core";
import { getUser } from "@/lib/auth";
import { adminClient } from "@/server/admin";
import { isStaff } from "@/server/leads";

/** Staff: every lead as a CSV for a spreadsheet or dialer (after two-step sign-in). */
export async function GET() {
  const user = await getUser();
  if (!isStaff(user) || user?.aal !== "aal2") return new Response("Not allowed", { status: 403 });
  const admin = adminClient();
  if (!admin) return new Response("Server key missing", { status: 503 });
  const { data } = await admin.rpc("lead_list");
  return new Response(leadsCsv((data ?? []) as LeadRow[]), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="tidemark-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
