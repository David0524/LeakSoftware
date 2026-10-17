import "server-only";
import { headers } from "next/headers";

/**
 * Public base URL for links we hand out (invites, email links) and for the pages the server
 * itself renders to PDF. On Vercel it never comes from request headers, which a client can
 * set (security audit, 2026-10-17): APP_BASE_URL, else Vercel's own production or deployment
 * URL. Only local and CI servers fall back to the request's host.
 */
export async function siteOrigin(): Promise<string> {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  const vercel =
    process.env.VERCEL_ENV === "production"
      ? (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL)
      : process.env.VERCEL_URL;
  if (process.env.VERCEL && vercel) return `https://${vercel}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
