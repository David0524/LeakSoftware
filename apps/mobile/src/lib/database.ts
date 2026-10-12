import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import { getRandomBytes } from "expo-crypto";
import { nestedTransactions, type SqlDatabase } from "@leakbook/sync";

const DB_NAME = "leakbook.db";
const KEY_NAME = "leakbook.db-key.v1";

export interface LocalDatabase {
  db: SqlDatabase;
  /** True when SQLCipher is active (dev and production builds; not Expo Go). */
  encrypted: boolean;
  kv: KeyValue;
}

export interface KeyValue {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

function databaseKey(): string {
  let key = SecureStore.getItem(KEY_NAME);
  if (!key) {
    key = Array.from(getRandomBytes(32), (b) => b.toString(16).padStart(2, "0")).join("");
    SecureStore.setItem(KEY_NAME, key);
  }
  return key;
}

function openRaw(): { raw: SQLite.SQLiteDatabase; encrypted: boolean } {
  const raw = SQLite.openDatabaseSync(DB_NAME);
  // The key must be the first statement. Hex only, so it is safe to inline.
  raw.execSync(`PRAGMA key = '${databaseKey()}'`);
  let encrypted = false;
  try {
    encrypted = Boolean(
      raw.getFirstSync<{ cipher_version?: string }>("PRAGMA cipher_version")?.cipher_version,
    );
  } catch {
    encrypted = false;
  }
  // Fails here if the file was written without this key (for example a database created in
  // Expo Go, then opened by an encrypted dev build).
  raw.getFirstSync("select count(*) from sqlite_master");
  raw.execSync("PRAGMA journal_mode = WAL");
  return { raw, encrypted };
}

/** Open (or create) the local database. Encrypted with a key kept in the device keychain. */
export function openLocalDatabase(): LocalDatabase {
  let opened: { raw: SQLite.SQLiteDatabase; encrypted: boolean };
  try {
    opened = openRaw();
  } catch (e) {
    // Unreadable with this key: only happens when switching between Expo Go and a dev build.
    // Start a fresh database; the server copy is restored on the next sync.
    console.warn("Local database could not be opened; starting fresh.", e);
    SQLite.deleteDatabaseSync(DB_NAME);
    opened = openRaw();
  }
  const { raw, encrypted } = opened;

  const db: SqlDatabase = {
    run: (sql, params = []) => {
      raw.runSync(sql, params as SQLite.SQLiteBindValue[]);
    },
    all: <T>(sql: string, params: unknown[] = []) =>
      raw.getAllSync<T>(sql, params as SQLite.SQLiteBindValue[]),
    get: <T>(sql: string, params: unknown[] = []) =>
      raw.getFirstSync<T>(sql, params as SQLite.SQLiteBindValue[]) ?? undefined,
    transaction: nestedTransactions((sql) => raw.execSync(sql)),
  };

  db.run("create table if not exists app_kv (key text primary key, value text not null)");
  const kv: KeyValue = {
    get: (key) =>
      db.get<{ value: string }>("select value from app_kv where key = ?", [key])?.value ?? null,
    set: (key, value) =>
      db.run("insert or replace into app_kv (key, value) values (?, ?)", [key, value]),
    remove: (key) => db.run("delete from app_kv where key = ?", [key]),
  };

  return { db, encrypted, kv };
}
