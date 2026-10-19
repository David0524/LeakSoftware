import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { notify } = await import("../src/server/push");

/** A client answering profile and push_device reads, and recording deletes. */
function db(rows: { profiles: object[]; devices: object[] }) {
  const deleted: string[][] = [];
  const query = (data: unknown) => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.in = (_: string, ids: string[]) => {
      if (deleting) deleted.push(ids);
      return q;
    };
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data }).then(ok);
    let deleting = false;
    q.delete = () => {
      deleting = true;
      return q;
    };
    return q;
  };
  return {
    deleted,
    client: {
      from: (t: string) => query(t === "profile" ? rows.profiles : rows.devices),
    } as never,
  };
}

describe("notify", () => {
  beforeEach(() => fetchMock.mockReset());

  it("skips people who turned the kind off, and drops tokens Expo says are gone", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }],
        }),
      ),
    );
    const { client, deleted } = db({
      profiles: [
        { id: "a", notification_prefs: {} },
        { id: "b", notification_prefs: { payment: false } },
        { id: "c", notification_prefs: { text: false } },
      ],
      devices: [
        { id: "d1", user_id: "a", service: "expo", token: "ExponentPushToken[a]" },
        { id: "d2", user_id: "c", service: "expo", token: "ExponentPushToken[c]" },
        { id: "d3", user_id: "b", service: "expo", token: "ExponentPushToken[b]" },
      ],
    });
    const r = await notify(client, {
      userIds: ["a", "b", "c", "a"],
      kind: "payment",
      text: { title: "Payment received", body: "Smith paid $10.00 (deposit)." },
      data: { job: "j1" },
    });
    expect(r).toEqual({ sent: 1 });
    const sent = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as { to: string }[];
    expect(sent.map((m) => m.to)).toEqual(["ExponentPushToken[a]", "ExponentPushToken[c]"]);
    expect(sent[0]).toMatchObject({
      title: "Payment received",
      data: { kind: "payment", job: "j1" },
    });
    expect(deleted).toContainEqual(["d2"]);
  });

  it("never throws", async () => {
    const r = await notify(
      {
        from: () => {
          throw new Error("down");
        },
      } as never,
      {
        userIds: ["a"],
        kind: "text",
        text: { title: "x", body: "y" },
      },
    );
    expect(r).toEqual({ sent: 0 });
  });
});

describe("Apple's provider token", () => {
  it("is an ES256 JWT for the team, signed with the .p8 key", async () => {
    const { generateKeyPairSync, verify } = await import("node:crypto");
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    // Vercel may keep the key's line breaks as "\n".
    process.env.APNS_KEY = (privateKey.export({ type: "pkcs8", format: "pem" }) as string).replace(
      /\n/g,
      "\\n",
    );
    process.env.APNS_KEY_ID = "ABC123DEFG";
    process.env.APNS_TEAM_ID = "TEAM123456";
    const { apnsToken } = await import("../src/server/push");
    const [head, body, sig] = apnsToken().split(".");
    expect(JSON.parse(Buffer.from(head!, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "ABC123DEFG",
    });
    expect(JSON.parse(Buffer.from(body!, "base64url").toString())).toMatchObject({
      iss: "TEAM123456",
    });
    expect(
      verify(
        "sha256",
        Buffer.from(`${head}.${body}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(sig!, "base64url"),
      ),
    ).toBe(true);
  });
});
