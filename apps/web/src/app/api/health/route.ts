import { connection } from "next/server";
import { checkHealth } from "@/server/health";

/** GET: for an uptime monitor. 200 when the database and sign-in answer, 503 otherwise. */
export async function GET() {
  await connection();
  const health = await checkHealth();
  return Response.json(health, {
    status: health.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
