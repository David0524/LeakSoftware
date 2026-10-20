import { beforeEach, describe, expect, it, vi } from "vitest";

// A notification tap handled once, and a capture Android closed the app during, saved anyway.

const m = vi.hoisted(() => ({
  pending: null as unknown,
  requestStopAction: vi.fn(),
  navigate: vi.fn(),
  push: vi.fn(),
  addMedia: vi.fn(),
  storeCapture: vi.fn(async (id: string) => ({
    id,
    relativePath: `media/${id}.jpg`,
    sizeBytes: 10,
    sha256: "abc",
  })),
}));
const kv = new Map<string, string>();

vi.mock("react-native", () => ({ Platform: { OS: "android" }, Linking: { openURL: vi.fn() } }));
vi.mock("expo-constants", () => ({ default: {} }));
vi.mock("expo-notifications", () => ({}));
vi.mock("expo-router", () => ({ router: { navigate: m.navigate, push: m.push } }));
vi.mock("expo-crypto", () => ({}));
vi.mock("expo-file-system", () => ({ Directory: class {}, File: class {}, Paths: {} }));
vi.mock("expo-location", () => ({}));
vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => ({
      resize() {},
      renderAsync: async () => ({
        saveAsync: async () => ({ uri: "file:///small.jpg", width: 2048, height: 1536 }),
      }),
    }),
  },
}));
vi.mock("expo-image-picker", () => ({ getPendingResultAsync: async () => m.pending }));
vi.mock("../src/lib/config", () => ({ API_URL: "https://sundeck.test" }));
vi.mock("../src/lib/liveStop", () => ({ requestStopAction: m.requestStopAction }));
vi.mock("../src/data/hooks", () => ({ useJobRows: () => [] }));
vi.mock("../src/lib/media", async (original) => ({
  ...(await original<typeof import("../src/lib/media")>()),
  storeCapture: m.storeCapture,
}));
vi.mock("../src/lib/services", () => ({
  getServices: () => ({
    kv: {
      get: (k: string) => kv.get(k) ?? null,
      set: (k: string, v: string) => void kv.set(k, v),
      remove: (k: string) => void kv.delete(k),
    },
    sync: { addMedia: m.addMedia },
  }),
}));

const { handleResponse } = await import("../src/lib/push");
const { recoverPendingCapture, rememberCapture, forgetCapture } = await import("../src/data/media");

beforeEach(() => {
  kv.clear();
  vi.clearAllMocks();
  m.pending = null;
});

const tap = (id: string, action: string, date: number, data: Record<string, unknown>) =>
  ({
    actionIdentifier: action,
    notification: { date, request: { identifier: id, content: { data } } },
  }) as never;

describe("notification taps", () => {
  it("the tap that launched the app is handled once", () => {
    const launch = tap("n1", "mark_complete", 100, { job: "j1" });
    handleResponse(launch);
    handleResponse(launch);
    expect(m.requestStopAction).toHaveBeenCalledTimes(1);
    const open = tap("n2", "expo.modules.notifications.actions.DEFAULT", 100, { job: "j2" });
    handleResponse(open);
    handleResponse(open);
    expect(m.push).toHaveBeenCalledTimes(1);
  });
  it("the current stop's notification, shown again for the next stop, still works", () => {
    handleResponse(tap("current-stop", "on_my_way", 100, { job: "j1" }));
    handleResponse(tap("current-stop", "on_my_way", 200, { job: "j2" }));
    expect(m.requestStopAction.mock.calls).toEqual([
      ["j1", "on_my_way"],
      ["j2", "on_my_way"],
    ]);
  });
});

describe("a capture Android closed the app during", () => {
  const intent = {
    companyId: "c1",
    target: { jobId: "j1", findingId: "f1" },
    kind: "photo" as const,
    source: "camera" as const,
  };
  it("is saved to the finding it was taken for", async () => {
    rememberCapture(intent);
    m.pending = {
      canceled: false,
      assets: [{ uri: "file:///big.heic", width: 4032, height: 3024 }],
    };
    await expect(recoverPendingCapture()).resolves.toBe("j1");
    expect(m.addMedia).toHaveBeenCalledTimes(1);
    const [, companyId, values] = m.addMedia.mock.calls[0]!;
    expect(companyId).toBe("c1");
    expect(values).toMatchObject({ job_id: "j1", finding_id: "f1", kind: "photo" });
    expect(kv.has("capture:pending")).toBe(false);
    // Only once.
    await expect(recoverPendingCapture()).resolves.toBeNull();
    expect(m.addMedia).toHaveBeenCalledTimes(1);
  });
  it("nothing happens on Cancel, an error, nothing pending, or no capture under way", async () => {
    for (const pending of [
      { canceled: true, assets: null },
      { code: "ERR", message: "camera failed" },
      null,
    ]) {
      rememberCapture(intent);
      m.pending = pending;
      await expect(recoverPendingCapture()).resolves.toBeNull();
      expect(kv.has("capture:pending")).toBe(false);
    }
    m.pending = { canceled: false, assets: [{ uri: "file:///x.jpg", width: 1, height: 1 }] };
    await expect(recoverPendingCapture()).resolves.toBeNull();
    rememberCapture(intent);
    forgetCapture();
    await expect(recoverPendingCapture()).resolves.toBeNull();
    kv.set("capture:pending", "{broken");
    await expect(recoverPendingCapture()).resolves.toBeNull();
    expect(m.addMedia).not.toHaveBeenCalled();
  });
});
