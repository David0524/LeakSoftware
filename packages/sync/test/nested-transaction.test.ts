import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { LocalStore, nestedTransactions, type SqlDatabase } from "../src";

/** SQLite through nestedTransactions only (like expo-sqlite), not better-sqlite3's own nesting. */
function plainDb() {
  const raw = new Database(":memory:");
  const db: SqlDatabase = {
    run: (sql, p = []) => void raw.prepare(sql).run(...(p as unknown[])),
    all: <T>(sql: string, p: unknown[] = []) => raw.prepare(sql).all(...p) as T[],
    get: <T>(sql: string, p: unknown[] = []) => raw.prepare(sql).get(...p) as T | undefined,
    transaction: nestedTransactions((sql) => raw.exec(sql)),
  };
  return db;
}

const C = "00000000-0000-4000-8000-0000000000c1";

describe("nestedTransactions", () => {
  it("commits nested work together", () => {
    const store = LocalStore.open(plainDb());
    store.database.transaction(() => {
      store.insert("customer", C, { name: "a" });
      store.insert("property", C, { address_line1: "1 St" });
    });
    expect(store.pendingCount()).toBe(2);
  });

  it("rolls back everything when the outer unit fails", () => {
    const store = LocalStore.open(plainDb());
    expect(() =>
      store.database.transaction(() => {
        store.insert("customer", C, { name: "a" });
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(store.list("customer")).toHaveLength(0);
    expect(store.pendingCount()).toBe(0);
  });

  it("an inner failure caught by the caller keeps the outer work", () => {
    const store = LocalStore.open(plainDb());
    store.database.transaction(() => {
      store.insert("customer", C, { name: "kept" });
      try {
        store.database.transaction(() => {
          store.insert("customer", C, { name: "dropped" });
          throw new Error("inner");
        });
      } catch {
        // ignored on purpose
      }
    });
    expect(store.list("customer").map((r) => r.name)).toEqual(["kept"]);
  });

  it("clearAll removes data but keeps the device identity", () => {
    const store = LocalStore.open(plainDb(), { deviceId: "keepme" });
    store.insert("customer", C, { name: "a" });
    store.clearAll();
    expect(store.list("customer", { includeDeleted: true })).toHaveLength(0);
    expect(store.pendingCount()).toBe(0);
    expect(store.deviceId).toBe("keepme");
  });
});
