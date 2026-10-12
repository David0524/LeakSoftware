import "server-only";
import dev from "../../../../../config/supabase-dev.json";

/**
 * Supabase connection settings. Production and staging set SUPABASE_URL and
 * SUPABASE_ANON_KEY; local development falls back to the public settings of the dev project.
 */
export const supabaseUrl = process.env.SUPABASE_URL || dev.url;
export const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || dev.publishableKey;
