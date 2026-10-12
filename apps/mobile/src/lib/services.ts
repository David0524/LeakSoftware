import type { SupabaseClient } from "@supabase/supabase-js";
import { LocalStore, TusUploader } from "@leakbook/sync";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";
import { openLocalDatabase, type KeyValue } from "./database";
import { fileSource } from "./media";
import { createSupabase } from "./supabase";
import { SyncService } from "./sync-service";

export interface Services {
  supabase: SupabaseClient;
  sync: SyncService;
  kv: KeyValue;
  encrypted: boolean;
}

let services: Services | null = null;

/** App-wide singletons, created on first use. */
export function getServices(): Services {
  if (!services) {
    const { db, kv, encrypted } = openLocalDatabase();
    const store = LocalStore.open(db);
    const supabase = createSupabase(kv);
    const uploader = new TusUploader({
      supabaseUrl: SUPABASE_URL,
      apiKey: SUPABASE_PUBLISHABLE_KEY,
      accessToken: async () =>
        (await supabase.auth.getSession()).data.session?.access_token ?? null,
      files: fileSource,
    });
    services = { supabase, sync: new SyncService(store, supabase, kv, uploader), kv, encrypted };
  }
  return services;
}
