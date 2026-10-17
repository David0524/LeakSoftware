import { clientFromRequest, jsonError } from "@/server/bearer";
import { deleteAccount } from "@/server/account";

/** POST: delete the signed-in user's account (the app's Settings › Delete My Account). */
export async function POST(request: Request) {
  const db = await clientFromRequest(request);
  if (!db) return jsonError("Sign in again.", 401);
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    return Response.json(await deleteAccount(db, token));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), 400);
  }
}
