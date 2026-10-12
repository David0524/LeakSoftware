import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";
import type { KeyValue } from "./database";

/**
 * Supabase client whose session lives in the encrypted local database. Tokens refresh
 * only while the app is in the foreground (the Supabase recommendation for mobile).
 */
export function createSupabase(kv: KeyValue): SupabaseClient {
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: {
        getItem: async (k) => kv.get(`auth:${k}`),
        setItem: async (k, v) => kv.set(`auth:${k}`, v),
        removeItem: async (k) => kv.remove(`auth:${k}`),
      },
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  AppState.addEventListener("change", (state) => {
    if (state === "active") void client.auth.startAutoRefresh();
    else void client.auth.stopAutoRefresh();
  });
  return client;
}
