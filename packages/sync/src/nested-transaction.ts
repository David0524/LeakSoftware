/**
 * Transactions that nest, using SAVEPOINTs below the outer BEGIN. Drivers such as
 * expo-sqlite do not nest on their own, and LocalStore writes run inside callers'
 * transactions (for example "create customer, property, and job" as one unit).
 */
export function nestedTransactions(exec: (sql: string) => void): <T>(fn: () => T) => T {
  let depth = 0;
  return <T>(fn: () => T): T => {
    const name = `lb_sp_${depth}`;
    exec(depth === 0 ? "BEGIN" : `SAVEPOINT ${name}`);
    depth += 1;
    try {
      const result = fn();
      depth -= 1;
      exec(depth === 0 ? "COMMIT" : `RELEASE ${name}`);
      return result;
    } catch (e) {
      depth -= 1;
      exec(depth === 0 ? "ROLLBACK" : `ROLLBACK TO ${name}`);
      if (depth > 0) exec(`RELEASE ${name}`);
      throw e;
    }
  };
}
