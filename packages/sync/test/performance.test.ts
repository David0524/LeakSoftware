import { describe, expect, it } from "vitest";
import { LocalStore, type PullPage } from "../src";
import { memoryDb } from "./sqlite";

// M11: a busy tech's phone after a year: 1,000 jobs, each with a 27-item checklist and 10
// photos (10,000 photos), loaded the way sync loads them (pulled pages). The job screen must
// stay quick: it reads one job's rows through the job index, not every row of a table.
// Budgets are loose for slow CI machines; a phone is slower than a laptop, so the job-screen
// reads must be far below them.

const C = "00000000-0000-4000-8000-0000000000c1";
const JOBS = 1_000;
const ITEMS = 27;
const PHOTOS = 10;

function time<T>(fn: () => T): { ms: number; value: T } {
  const start = performance.now();
  const value = fn();
  return { ms: performance.now() - start, value };
}

function loaded(): LocalStore {
  const store = LocalStore.open(memoryDb());
  let n = 0;
  const id = (prefix: string) => `${prefix}-${String(n++).padStart(8, "0")}`;
  const rows: PullPage["rows"] = [];
  for (let j = 0; j < JOBS; j++) {
    const job = `job-${String(j).padStart(5, "0")}`;
    rows.push({
      xid: "1",
      table: "job",
      row: { id: job, company_id: C, status: "report_sent", number: j },
    });
    for (let i = 0; i < ITEMS; i++) {
      const comp = id("jc");
      rows.push({
        xid: "1",
        table: "job_component",
        row: { id: comp, company_id: C, job_id: job, label: `Item ${i}`, sort_order: i },
      });
      rows.push({
        xid: "1",
        table: "checklist_item_result",
        row: {
          id: id("cr"),
          company_id: C,
          job_id: job,
          job_component_id: comp,
          status: "inspected",
          outcome: "ok",
        },
      });
    }
    for (let p = 0; p < PHOTOS; p++)
      rows.push({
        xid: "1",
        table: "media",
        row: {
          id: id("m"),
          company_id: C,
          job_id: job,
          kind: "photo",
          storage_path: `${C}/${job}/${p}.jpg`,
          upload_state: "uploaded",
        },
      });
  }
  for (let i = 0; i < rows.length; i += 500)
    store.applyPage({
      rows: rows.slice(i, i + 500),
      done: false,
      cursor: {},
      server_hlc: "1800000000000-0000-server",
    });
  return store;
}

describe("a phone with 1,000 jobs and 10,000 photos", () => {
  const { ms: loadMs, value: store } = time(loaded);
  const job = "job-00500";

  it("loads through sync in reasonable time", () => {
    expect(store.list("media").length).toBe(JOBS * PHOTOS);
    expect(loadMs).toBeLessThan(30_000);
  });

  it("reads one job's checklist and photos quickly", () => {
    const read = time(() => ({
      components: store.list("job_component", { companyId: C, jobId: job }),
      results: store.list("checklist_item_result", { companyId: C, jobId: job }),
      media: store.list("media", { companyId: C, jobId: job }),
    }));
    expect(read.value.components).toHaveLength(ITEMS);
    expect(read.value.results).toHaveLength(ITEMS);
    expect(read.value.media).toHaveLength(PHOTOS);
    // Reading the whole tables instead, for comparison.
    const whole = time(() => [
      store.list("job_component", { companyId: C }),
      store.list("checklist_item_result", { companyId: C }),
      store.list("media", { companyId: C }),
    ]);
    console.log(
      `load ${loadMs.toFixed(0)} ms · one job ${read.ms.toFixed(2)} ms · whole tables ${whole.ms.toFixed(0)} ms`,
    );
    expect(read.ms).toBeLessThan(25);
    expect(read.ms * 20).toBeLessThan(whole.ms);
  });

  it("saves a checklist answer and lists the jobs quickly", () => {
    const save = time(() =>
      store.write("checklist_item_result", "cr-new", C, {
        job_id: job,
        status: "inspected",
        outcome: "leaking",
      }),
    );
    const jobs = time(() => store.list("job", { companyId: C }));
    expect(jobs.value).toHaveLength(JOBS);
    expect(save.ms).toBeLessThan(25);
    expect(jobs.ms).toBeLessThan(250);
    expect(time(() => store.pendingBatch(200)).ms).toBeLessThan(50);
  });
});
