import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportRequest } from "../src/lib/reportRequests";

// Edge cases for the offline report queue (one-handed use, item 6) and the automatic visit
// report queue it copies: the app's services, React Native and the network are stand-ins.

const rn = vi.hoisted(() => ({
  AppState: { currentState: "active" as string },
  Platform: { OS: "android" },
  Share: { share: vi.fn(async () => ({ action: "sharedAction" })) },
}));
vi.mock("react-native", () => rn);
// Android's titled share sheet is native; without it the text goes to React Native's Share.
vi.mock("../modules/link-share", () => ({ LinkShareNative: null }));
vi.mock("../src/lib/config", () => ({ API_URL: "https://sundeck.test" }));
vi.mock("../src/data/hooks", () => ({ useJobRows: () => [] }));

const kvMap = new Map<string, string>();
const pending = new Set<string>();
const uploading = new Set<string>();
const sync = {
  status: { lastSyncedAt: 1 as number | null },
  hasPendingWrites: (table: string, id?: string) =>
    [...pending].some((p) => p === `${table}:${id ?? ""}` || (!id && p.startsWith(`${table}:`))),
  hasPendingUploads: (jobId: string) => uploading.has(jobId),
  get: (table: string, id: string) =>
    table === "report" ? { id, job_id: id === "r1" ? "j1" : "j2" } : undefined,
  syncNow: vi.fn(async () => {}),
  subscribe: vi.fn(() => () => {}),
  accessToken: vi.fn(async (): Promise<string | null> => "token"),
};
vi.mock("../src/lib/services", () => ({
  getServices: () => ({
    kv: {
      get: (k: string) => kvMap.get(k) ?? null,
      set: (k: string, v: string) => void kvMap.set(k, v),
      remove: (k: string) => void kvMap.delete(k),
    },
    sync,
  }),
}));

const { flushReportRequests, queueReportRequest } = await import("../src/lib/reportQueue");
const { flushVisitReports, queueAutoVisitReport } = await import("../src/lib/visitReports");

const KEY = "report_request:queue";
const queued = () => JSON.parse(kvMap.get(KEY) ?? "[]") as ReportRequest[];
const email: ReportRequest = { kind: "email", reportId: "r1", jobId: "j1", to: "a@b.co" };
const text: ReportRequest = { kind: "text", reportId: "r1", jobId: "j1", to: "5551234567" };

type Reply = { status: number; body?: unknown } | Error;
let replies: Reply[] = [];
const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
  const r = replies.shift() ?? { status: 200, body: { message: "Your report: link" } };
  if (r instanceof Error) throw r;
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    json: async () => {
      if (r.body === undefined) throw new SyntaxError("not json");
      return r.body;
    },
  } as Response;
});

beforeEach(() => {
  kvMap.clear();
  pending.clear();
  uploading.clear();
  replies = [];
  fetchMock.mockClear();
  rn.Share.share.mockClear();
  rn.AppState.currentState = "active";
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("offline report queue", () => {
  it("sends once and empties the queue", async () => {
    queueReportRequest(email);
    await Promise.all([flushReportRequests(), flushReportRequests(), flushReportRequests()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://sundeck.test/api/reports/r1/send");
    expect(kvMap.has(KEY)).toBe(false);
  });

  it("waits while the job, the report or any signature is still on the phone", async () => {
    queueReportRequest(email);
    for (const p of ["job:j1", "report:r1", "signature:s9"]) {
      pending.clear();
      pending.add(p);
      await flushReportRequests();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(queued()).toEqual([email]);
    }
  });

  it("waits for the job's signature image and photos to upload", async () => {
    queueReportRequest({ kind: "finish", reportId: "r1", jobId: "j1", to: null });
    uploading.add("j1");
    await flushReportRequests();
    expect(fetchMock).not.toHaveBeenCalled();
    uploading.clear();
    await flushReportRequests();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the request on no connection, sign-in trouble and a server fault", async () => {
    queueReportRequest(email);
    for (const r of [
      new TypeError("Network request failed"),
      { status: 401, body: { error: "Sign in again." } },
      { status: 502 },
      { status: 500, body: { error: "Something went wrong." } },
    ] satisfies Reply[]) {
      replies = [r];
      await flushReportRequests();
      expect(queued()).toEqual([email]);
    }
    sync.accessToken.mockResolvedValueOnce(null);
    await flushReportRequests();
    expect(queued()).toEqual([email]);
  });

  it("drops a request the server refuses (already sent, deleted), and goes on", async () => {
    queueReportRequest(email);
    queueReportRequest({ kind: "finish", reportId: "r2", jobId: "j2", to: null });
    replies = [{ status: 400, body: { error: "This report was already sent." } }];
    await flushReportRequests();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(kvMap.has(KEY)).toBe(false);
  });

  it("doesn't drop a newer request made while the older one was on its way", async () => {
    queueReportRequest(email);
    let release!: () => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, status: 200, json: async () => ({}) } as Response);
        }),
    );
    const flushing = flushReportRequests();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const newer = { ...email, to: "c@d.co" };
    queueReportRequest(newer);
    release();
    await flushing;
    expect(queued()).toEqual([newer]);
  });

  it("keeps Send by Text until the app is in front, where the share sheet can open", async () => {
    queueReportRequest(text);
    rn.AppState.currentState = "background";
    await flushReportRequests();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(queued()).toEqual([text]);
    rn.AppState.currentState = "active";
    await flushReportRequests();
    expect(rn.Share.share).toHaveBeenCalledWith({ message: "Your report: link" });
    expect(kvMap.has(KEY)).toBe(false);
  });

  it("survives a damaged stored queue", async () => {
    kvMap.set(KEY, "{oops");
    await expect(flushReportRequests()).resolves.toBeUndefined();
    kvMap.set(KEY, JSON.stringify([{ kind: "email", reportId: 7, jobId: "j" }, null, "x"]));
    await flushReportRequests();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("automatic visit report queue", () => {
  const VKEY = "visit_report:queue";
  it("keeps the visit on a server fault, whatever its message", async () => {
    const fault = { status: 503, body: { error: "Upstream unavailable" } };
    replies = [fault, fault];
    queueAutoVisitReport({ id: "j1", type: "maintenance" }, { visit_reports: "auto" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(async () => {
      await flushVisitReports(false);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(JSON.parse(kvMap.get(VKEY) ?? "[]")).toContain("j1");
  });
});

describe("the same request made again with a signal", () => {
  it("drops the waiting one so the report isn't sent twice", async () => {
    const { forgetReportRequest } = await import("../src/lib/reportQueue");
    const finish: ReportRequest = { kind: "finish", reportId: "r1", jobId: "j1", to: null };
    queueReportRequest(email);
    queueReportRequest(finish);
    forgetReportRequest("email", "r1");
    await flushReportRequests();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "https://sundeck.test/api/reports/r1/finish",
    ]);
  });
});

describe("photos still uploading", () => {
  it("Finish and Send with a signal wait instead of going without them", async () => {
    const { finishReportFromPhone, sendReportFromPhone, UploadsPendingError } =
      await import("../src/data/reports");
    uploading.add("j1");
    await expect(finishReportFromPhone("r1", false)).rejects.toBeInstanceOf(UploadsPendingError);
    await expect(sendReportFromPhone("r1", "email", "a@b.co")).rejects.toBeInstanceOf(
      UploadsPendingError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    uploading.clear();
    await sendReportFromPhone("r1", "email", "a@b.co");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("say so while they wait", async () => {
    const { queuedMessage } = await import("../src/lib/reportRequests");
    expect(queuedMessage({ waitingFor: "uploads" })).toBe(
      "Will send when the photos finish uploading.",
    );
    expect(queuedMessage(email)).toBe("Will send when you’re back online.");
    queueReportRequest({ ...email, waitingFor: "uploads" });
    uploading.add("j1");
    await flushReportRequests();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(queued()).toEqual([{ ...email, waitingFor: "uploads" }]);
  });

  it("the automatic visit report waits for the visit's photos", async () => {
    uploading.add("j7");
    queueAutoVisitReport({ id: "j7", type: "maintenance" }, { visit_reports: "auto" });
    await vi.waitFor(async () => {
      await flushVisitReports(false);
      expect(JSON.parse(kvMap.get("visit_report:queue") ?? "[]")).toEqual(["j7"]);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    uploading.clear();
    await vi.waitFor(async () => {
      await flushVisitReports(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(kvMap.has("visit_report:queue")).toBe(false);
  });
});
