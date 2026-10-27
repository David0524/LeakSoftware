import { leadsCsv, type LeadRow } from "@leakbook/core";
import { getUser } from "@/lib/auth";
import { adminClient } from "@/server/admin";
import { isStaff } from "@/server/leads";

/** Staff: every lead as a CSV for a spreadsheet or dialer (after two-step sign-in). */
export async function GET() {
  const user = await getUser();
  if (!isStaff(user) || user?.aal !== "aal2") return new Response("Not allowed", { status: 403 });
  const admin = adminClient();
  if (!admin)
    return new Response("The export isn’t available right now. Try again in a moment.", {
      status: 503,
    });
  const { data, error } = await admin.rpc("lead_list");
  if (error) {
    console.error("[admin] lead export:", error.message);
    return new Response("The export isn’t available right now. Try again in a moment.", {
      status: 500,
    });
  }
  return new Response(leadsCsv((data ?? []) as LeadRow[]), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="sundeck-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
