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
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  // Check the token with a plain client: one that also sends it as a default header would send
  // Authorization twice on this call, which the auth server rejects.
  const { data, error } = await createClient(supabaseUrl, supabaseAnonKey, options).auth.getUser(
    token,
  );
  if (error || !data.user) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    ...options,
    global: { headers: { authorization: `Bearer ${token}` } },
  });
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
