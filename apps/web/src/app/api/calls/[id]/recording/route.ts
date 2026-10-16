import { bearerSession } from "@/server/bearer";
import { createClient } from "@/lib/supabase/server";
import { fetchTwilioFile, recordingUrl } from "@/server/twilio";

/**
 * GET: a voicemail's audio. Twilio keeps it behind the account's credentials, so members get
 * it through here (signed in on the website, or with the phone's Bearer token).
 */
export async function GET(request: Request, ctx: RouteContext<"/api/calls/[id]/recording">) {
  const { id } = await ctx.params;
  const db = request.headers.get("authorization")
    ? (await bearerSession(request))?.db
    : await createClient();
  if (!db) return new Response("Sign in again.", { status: 401 });
  const { data } = await db.from("call_log").select("recording_sid").eq("id", id).maybeSingle();
  if (!data?.recording_sid) return new Response("Not found", { status: 404 });
  const res = await fetchTwilioFile(recordingUrl(data.recording_sid as string));
  if (!res.ok || !res.body) return new Response("Not found", { status: 404 });
  return new Response(res.body, {
    headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" },
  });
}
