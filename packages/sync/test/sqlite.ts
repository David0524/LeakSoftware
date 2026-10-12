import Database from "better-sqlite3";
import type { SqlDatabase } from "../src";

/** In-memory SQLite with the same interface the app gets from expo-sqlite. */
export function memoryDb(): SqlDatabase {
  const db = new Database(":memory:");
  return {
    run: (sql, params = []) => {
      db.prepare(sql).run(...(params as unknown[]));
    },
    all: <T>(sql: string, params: unknown[] = []) => db.prepare(sql).all(...params) as T[],
    get: <T>(sql: string, params: unknown[] = []) =>
      db.prepare(sql).get(...params) as T | undefined,
    transaction: <T>(fn: () => T) => db.transaction(fn)(),
  };
}
