import { createClient } from "@supabase/supabase-js";
import { transcribeMedia } from "@/server/transcribe";
import { transcriptionDeps } from "@/server/transcription";

export const maxDuration = 60;

/**
 * POST /api/media/{id}/transcribe with the user's access token as a Bearer token.
 * The media row is read as that user (RLS), so only members of the company can ask.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/media/[id]/transcribe">) {
  const { id } = await ctx.params;
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  if (!url || !anonKey || !serviceKey || !deepgramKey)
    return Response.json({ error: "Transcription is not configured" }, { status: 503 });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sign in required" }, { status: 401 });

  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const asUser = createClient(url, anonKey, {
    ...options,
    global: { headers: { authorization: `Bearer ${token}` } },
  });
  const admin = createClient(url, serviceKey, options);

  const result = await transcribeMedia(transcriptionDeps(asUser, admin, deepgramKey), id);
  return Response.json(result.body, { status: result.status });
}
