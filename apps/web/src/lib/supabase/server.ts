import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "./config";

/**
 * Supabase client acting as the signed-in user (RLS applies). The session lives in cookies;
 * proxy.ts refreshes it, so Server Components may ignore cookie writes.
 */
export async function createClient() {
  // Supabase's auth client reads the clock; mark this render as per-request first
  // (cacheComponents refuses unstable values while prerendering).
  await connection();
  const store = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}
