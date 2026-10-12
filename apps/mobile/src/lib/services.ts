import type { SupabaseClient } from "@supabase/supabase-js";
import { LocalStore } from "@leakbook/sync";
import { openLocalDatabase, type KeyValue } from "./database";
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
    services = { supabase, sync: new SyncService(store, supabase, kv), kv, encrypted };
  }
  return services;
}
