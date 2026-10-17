import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import dev from "../../../config/supabase-dev.json";

/** The backend the app under test uses (same rule as src/lib/supabase/config.ts). */
const SUPABASE_URL = process.env.SUPABASE_URL || dev.url;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || dev.publishableKey;

/** Webhook signing secret the started app trusts (playwright.config.ts). */
export const E2E_WEBHOOK_SECRET = "whsec_leakbook_e2e";

/** CRON_SECRET of the started app, so tests can run the daily job (playwright.config.ts). */
export const E2E_CRON_SECRET = "cron_leakbook_e2e";

/** Twilio auth token of the started app: the tests sign Twilio's webhooks with it. */
export const E2E_TWILIO_TOKEN = "twilio_leakbook_e2e";

/** A signed-in client, acting the way the phone app does (RLS applies). */
export async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return db;
}

/** Service-role client; only CI (Supabase in Docker) has the key. */
export function adminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key
    ? createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

/** Body and Stripe-Signature header for a webhook event, as Stripe would send it. */
export function signedEvent(event: object): { data: string; headers: Record<string, string> } {
  const data = JSON.stringify(event);
  return {
    data,
    headers: {
      "content-type": "application/json",
      "stripe-signature": Stripe.webhooks.generateTestHeaderString({
        payload: data,
        secret: E2E_WEBHOOK_SECRET,
      }),
    },
  };
}
