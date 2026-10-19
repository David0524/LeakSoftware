import { bearerSession, jsonError } from "@/server/bearer";
import { weatherForZip } from "@/server/weather";

/**
 * GET ?zip=85201: the weather at the shop for the phone apps' Today screen, the same as the
 * website's Today shows. Signed-in users only; `{ weather: null }` when the weather service
 * doesn't answer or the zip code isn't a US one.
 */
export async function GET(request: Request) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const zip = new URL(request.url).searchParams.get("zip");
  if (!zip || !/^\d{5}$/.test(zip.trim())) return jsonError("Send a 5-digit zip code.", 400);
  return Response.json({ weather: await weatherForZip(zip.trim()) });
}
