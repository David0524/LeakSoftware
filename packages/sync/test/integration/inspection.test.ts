import {
  calculate,
  normalizeTestData,
  planComponents,
  type ComponentType,
  type JobComponent,
  type TestType,
} from "@leakbook/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCompany, device, localRow, pool, serverRow, type TestCompany } from "./harness";

let co: TestCompany;

beforeAll(async () => {
  co = await createCompany();
});

afterAll(async () => {
  await pool.end();
});

describe("M4 sample inspection", () => {
  it("is recorded offline on one phone and arrives intact on another", async () => {
    const a = device("inspA", co.tech);
    const b = device("inspB", co.owner);
    await a.engine.sync();
    await b.engine.sync();

    const types = a.store.list("component_type") as unknown as ComponentType[];
    const testTypes = a.store.list("test_type") as unknown as TestType[];
    const typeByKey = new Map(types.map((t) => [t.key, t]));
    const testByKey = new Map(testTypes.map((t) => [t.key, t]));

    // ---- Offline from here ----
    a.transport.offline = true;
    const customer = a.store.insert("customer", co.id, { name: "Sample Customer" });
    const property = a.store.insert("property", co.id, {
      customer_id: customer,
      address_line1: "9 Sample Way",
      has_spa: true,
      diagram_shape: "kidney",
    });
    const job = a.store.insert("job", co.id, {
      property_id: property,
      bill_to_customer_id: customer,
      status: "in_progress",
      started_at: new Date().toISOString(),
    });

    // Checklist: the defaults (one of each item), then a second skimmer and three more
    // returns: 2 skimmers, 4 returns.
    const planned = planComponents(types, { has_pool: true, has_spa: true });
    planned.push(
      {
        component_type_id: typeByKey.get("skimmer")!.id,
        instance_number: 2,
        label: "Skimmer 2",
        sort_order: 1002,
      },
      {
        component_type_id: typeByKey.get("return")!.id,
        instance_number: 2,
        label: "Return 2",
        sort_order: 2002,
      },
      {
        component_type_id: typeByKey.get("return")!.id,
        instance_number: 3,
        label: "Return 3",
        sort_order: 2003,
      },
      {
        component_type_id: typeByKey.get("return")!.id,
        instance_number: 4,
        label: "Return 4",
        sort_order: 2004,
      },
    );
    const compIds = new Map<string, string>();
    const resultIds = new Map<string, string>();
    a.store.database.transaction(() => {
      for (const p of planned) {
        const id = a.store.insert("job_component", co.id, { job_id: job, ...p });
        compIds.set(p.label, id);
        resultIds.set(
          p.label,
          a.store.insert("checklist_item_result", co.id, {
            job_id: job,
            job_component_id: id,
            status: "pending",
          }),
        );
      }
    });
    expect([...compIds.keys()].filter((l) => /^Skimmer( \d+)?$/.test(l))).toHaveLength(2);
    expect([...compIds.keys()].filter((l) => /^Returns?( \d+)?$/.test(l))).toHaveLength(4);
    expect(compIds.has("Spa")).toBe(true);

    // Mark everything: main drain excluded with a reason, the rest inspected.
    for (const [label, rid] of resultIds) {
      a.store.write(
        "checklist_item_result",
        rid,
        co.id,
        label === "Main drain"
          ? { status: "excluded", exclusion_reason: "No diver on site" }
          : {
              status: "inspected",
              method: label === "Structural cracks in pool" ? "Visual" : "Pressure test",
              inspected_at: new Date().toISOString(),
            },
      );
    }

    // Tests: 5 pressure (Return 3 fails), 1 bucket, 2 dye.
    const addTest = (
      key: string,
      label: string | null,
      raw: Record<string, string>,
      chosen?: "pass" | "fail",
    ) => {
      const tt = testByKey.get(key)!;
      const data = normalizeTestData(tt.field_schema, raw);
      const calc = calculate(tt, data);
      return a.store.insert("test_result", co.id, {
        job_id: job,
        job_component_id: label ? compIds.get(label)! : null,
        test_type_id: tt.id,
        schema_version: tt.schema_version,
        data,
        computed: calc.computed,
        // Types without a calculator (dye, listening) use the outcome the tech picks.
        outcome: chosen ?? calc.suggested ?? "pass",
        performed_at: new Date().toISOString(),
      });
    };
    for (const line of ["Skimmer", "Skimmer 2", "Returns", "Return 2"]) {
      addTest("pressure", line, {
        line_name: line,
        start_psi: "20",
        end_psi: "20",
        duration_min: "15",
      });
    }
    const failing = addTest("pressure", "Return 3", {
      line_name: "Return 3",
      start_psi: "20",
      end_psi: "12",
      duration_min: "15",
    });
    addTest("bucket", null, {
      pool_start_in: "10",
      pool_end_in: "9.25",
      bucket_start_in: "10",
      bucket_end_in: "9.94",
      duration_hours: "24",
    });
    addTest("dye", "All light niches and conduits", {
      location: "Light niche",
      observation: "No draw",
    });
    addTest(
      "dye",
      "Return 3",
      { location: "Return 3 fitting", observation: "Dye drawn in (leak)" },
      "fail",
    );

    // Findings with pins.
    const f1 = a.store.insert("finding", co.id, {
      job_id: job,
      job_component_id: compIds.get("Return 3")!,
      title: "Return 3 line break",
      severity_key: "major",
      pin_x: 0.42,
      pin_y: 0.18,
      status: "open",
    });
    const f2 = a.store.insert("finding", co.id, {
      job_id: job,
      job_component_id: compIds.get("All light niches and conduits")!,
      title: "Light niche seal worn",
      severity_key: "minor",
      pin_x: 0.81,
      pin_y: 0.66,
      status: "monitor",
    });

    const offline = await a.engine.sync();
    expect(offline.error).toBe("offline");
    expect(offline.pending).toBeGreaterThan(30);

    // ---- Back online ----
    a.transport.offline = false;
    const online = await a.engine.sync();
    expect(online.rejected, JSON.stringify(a.store.problems())).toBe(0);
    expect(online.pending).toBe(0);
    await b.engine.sync();

    // Server and both phones agree on every inspection row.
    const tables: [string, string[]][] = [
      ["job_component", [...compIds.values()]],
      ["checklist_item_result", [...resultIds.values()]],
      ["finding", [f1, f2]],
      ["test_result", [failing]],
    ];
    for (const [table, ids] of tables) {
      for (const id of ids) {
        const server = await serverRow(table, id);
        expect(server, `${table} ${id} on server`).toBeDefined();
        expect(localRow(b, table, id), `${table} on phone B`).toEqual(server);
        expect(localRow(a, table, id), `${table} on phone A`).toEqual(server);
      }
    }

    // What the office will see.
    const comps = (b.store.list("job_component") as unknown as JobComponent[]).filter(
      (c) => c.job_id === job,
    );
    const results = b.store.list("checklist_item_result").filter((r) => r.job_id === job);
    expect(results).toHaveLength(comps.length);
    expect(results.filter((r) => r.status === "inspected")).toHaveLength(comps.length - 1);
    expect(results.filter((r) => r.status === "excluded")).toHaveLength(1);
    const tests = b.store.list("test_result").filter((t) => t.job_id === job);
    expect(tests).toHaveLength(8);
    expect(tests.filter((t) => t.outcome === "fail")).toHaveLength(3); // Return 3 pressure, bucket, Return 3 dye
    const failed = b.store.get("test_result", failing)!;
    expect(failed.computed).toMatchObject({ drop_psi: 8 });
    const pins = b.store
      .list("finding")
      .filter((f) => f.job_id === job)
      .map((f) => [f.pin_x, f.pin_y]);
    expect(pins).toEqual(
      expect.arrayContaining([
        [0.42, 0.18],
        [0.81, 0.66],
      ]),
    );
  });

  it("an unknown verdict is refused by the server, not lost", async () => {
    const a = device("inspC", co.tech);
    await a.engine.sync();
    const types = a.store.list("component_type") as unknown as ComponentType[];
    const customer = a.store.insert("customer", co.id, { name: "Reasonless" });
    const property = a.store.insert("property", co.id, {
      customer_id: customer,
      address_line1: "1 Rule St",
    });
    const job = a.store.insert("job", co.id, { property_id: property, status: "in_progress" });
    const comp = a.store.insert("job_component", co.id, {
      job_id: job,
      component_type_id: types[0]!.id,
      instance_number: 1,
      label: "Test component",
    });
    a.store.insert("checklist_item_result", co.id, {
      job_id: job,
      job_component_id: comp,
      status: "inspected",
      outcome: "maybe",
    });
    const s = await a.engine.sync();
    expect(s.rejected).toBe(1);
    expect(a.store.problems()[0]).toMatchObject({
      table: "checklist_item_result",
      error: expect.stringContaining("23514"),
    });
  });
});
