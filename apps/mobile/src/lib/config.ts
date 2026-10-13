import dev from "../../../../config/supabase-dev.json";

/**
 * Public connection settings. EXPO_PUBLIC_* overrides (for staging or production builds)
 * fall back to the dev project. Only public values belong here.
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || dev.url;
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || dev.publishableKey;

/** Website for server features (reports, quotes, invoices, transcription): the dev site. */
export const API_URL =
  (process.env.EXPO_PUBLIC_API_URL || dev.webUrl || "").replace(/\/$/, "") || null;
