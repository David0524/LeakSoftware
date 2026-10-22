import { jsonError } from "@/server/bearer";
import { managerCall } from "@/server/mass-email-api";
import { massEmailSetup } from "@/server/mass-email";

/**
 * GET ?company_id=: the apps' Email Customers page (owner, 2026-10-22): the shop's name and
 * mailing address, the Show choices, the cities of its pools, emails left today, and the history.
 */
export async function GET(request: Request) {
  const call = await managerCall(request, new URL(request.url).searchParams.get("company_id"));
  if (call instanceof Response) return call;
  const setup = await massEmailSetup(call.session.db, call.companyId);
  if (!setup) return jsonError("Couldn’t load this. Try again.", 500);
  return Response.json(setup);
}
