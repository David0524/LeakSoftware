import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SEND_ONCE_WINDOW_MS, sendOnce, sentRecently } from "../src/server/send-once";

// A send happens once (owner, 2026-10-26: "taps submit twice"): the same thing to the same
// address within a moment is not sent again.

const KEY = {
  jobId: "job-1",
  channel: "email",
  recipient: "dana@bluewave.test",
  template: "report_homeowner",
} as const;

/** A message log holding `rows` (sent to the key's address), answering the query's filters. */
function logWith(rows: { at: number; status: string }[]) {
  const filters: Record<string, unknown> = {};
  let since = 0;
  const query: Record<string, unknown> = {};
  const chain = (name: string) =>
    vi.fn((column?: string, value?: unknown) => {
      if (name === "gte") since = Date.parse(value as string);
      else if (name === "eq") filters[column as string] = value;
      return query;
    });
  for (const m of ["select", "eq", "in", "gte"]) query[m] = chain(m);
  query.limit = () => ({
    data: rows
      .filter((r) => r.at >= since && ["sent", "delivered"].includes(r.status))
      .map(() => ({ id: "m" })),
    error: null,
  });
  return { db: { from: vi.fn(() => query) } as unknown as SupabaseClient, filters };
}

describe("sentRecently", () => {
  it("is true for a send inside the window and false for an older or failed one", async () => {
    const now = Date.now();
    expect(await sentRecently(logWith([{ at: now - 5_000, status: "sent" }]).db, KEY, now)).toBe(
      true,
    );
    expect(
      await sentRecently(
        logWith([{ at: now - SEND_ONCE_WINDOW_MS - 1, status: "sent" }]).db,
        KEY,
        now,
      ),
    ).toBe(false);
    expect(await sentRecently(logWith([{ at: now - 5_000, status: "failed" }]).db, KEY, now)).toBe(
      false,
    );
    expect(await sentRecently(logWith([]).db, KEY, now)).toBe(false);
  });

  it("looks for the same job, channel, address and template", async () => {
    const { db, filters } = logWith([]);
    await sentRecently(db, KEY);
    expect(filters).toMatchObject({
      job_id: "job-1",
      channel: "email",
      recipient: "dana@bluewave.test",
      template: "report_homeowner",
    });
  });
});

describe("sendOnce", () => {
  let send: ReturnType<typeof vi.fn<() => Promise<string>>>;
  beforeEach(() => {
    send = vi.fn(async () => "sent");
  });

  it("sends a second payment's receipt to the same address a moment later", async () => {
    const { db } = logWith([{ at: Date.now() - 5_000, status: "sent" }]);
    const receipt = { ...KEY, template: "receipt", ref: "payment-2" };
    expect(await sendOnce(db, receipt, send, () => "again")).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends when nothing went out a moment ago", async () => {
    const { db } = logWith([]);
    expect(await sendOnce(db, KEY, send, () => "again")).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("answers again, and sends nothing, when the same send just went out", async () => {
    const { db } = logWith([{ at: Date.now() - 1_000, status: "sent" }]);
    expect(await sendOnce(db, KEY, send, () => "again")).toBe("again");
    expect(send).not.toHaveBeenCalled();
  });

  it("shares one send between two requests at once", async () => {
    const { db } = logWith([]);
    let release!: () => void;
    const slow = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = () => resolve("sent");
        }),
    );
    const first = sendOnce(db, KEY, slow, () => "again");
    const second = sendOnce(db, KEY, slow, () => "again");
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    release();
    expect(await first).toBe("sent");
    expect(await second).toBe("sent");
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it("lets a later send through once the first has finished and aged out", async () => {
    const { db } = logWith([]);
    await sendOnce(db, KEY, send, () => "again");
    await sendOnce(db, KEY, send, () => "again");
    expect(send).toHaveBeenCalledTimes(2);
  });
});
