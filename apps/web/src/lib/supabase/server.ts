import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "./config";

/**
 * Supabase client acting as the signed-in user (RLS applies). The session lives in cookies;
 * proxy.ts refreshes it, so Server Components may ignore cookie writes.
 *
 * One per page render (React `cache`; actions and route handlers get a new one each call): a
 * component that asks late, such as Getting Started after the office loads, reuses the client
 * made while the request was open. Asking anew could land after a closed request (a tab that
 * moved on), where `connection()` and `cookies()` refuse ("used `connection()` inside
 * `after()`").
 */
export const createClient = cache(async () => {
  // Supabase's auth client reads the clock; mark this render as per-request first
  // (cacheComponents refuses unstable values while prerendering).
  await connection();
  const store = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    ...(process.env.DB_TIMING ? { global: { fetch: timedFetch } } : {}),
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
});

/** DB_TIMING=1: log each Supabase call and how long it took (finding slow pages). */
async function timedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const start = performance.now();
  const res = await fetch(input, init);
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
  // The start time shows which calls wait on others (a waterfall) and which run together.
  console.log(
    `[db] @${Math.round(start)} ${Math.round(performance.now() - start)}ms ${init?.method ?? "GET"} ${url.pathname}${url.search.slice(0, 80)}`,
  );
  return res;
}
