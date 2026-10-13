import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * A Supabase client acting as the phone's signed-in user (Authorization: Bearer <token>),
 * or null when the token is missing or invalid. RLS and the database functions check access.
 */
export async function clientFromRequest(request: Request): Promise<SupabaseClient | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const db = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { authorization: `Bearer ${token}` } },
  });
  const { data, error } = await db.auth.getUser(token);
  return error || !data.user ? null : db;
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
