import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/config";

/**
 * Service-role client for the few writes no signed-in person makes: Stripe webhooks,
 * payment accounts, stored PDFs. Null when the server has no service key.
 */
export function adminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key
    ? createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}
