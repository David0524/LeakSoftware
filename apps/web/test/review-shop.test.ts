import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The App Review shop (owner, 2026-10-24): its texts and emails are recorded as sent but never
// handed to Twilio or Resend (email to sundeckpro.com still goes, for testing), and it can't
// buy a phone number.

const REVIEW = "00000000-0000-4000-8000-00000000a001";
const OTHER = "00000000-0000-4000-8000-00000000b001";

/** The server's client: company reads answer from `review`; any other table is a mistake. */
const tables: string[] = [];
const db = {
  from(table: string) {
    tables.push(table);
    let ids: string[] = [];
    const q = {
      select: () => q,
      in: (_: string, v: string[]) => ((ids = v), q),
      eq: () => q,
      then: (done: (r: unknown) => unknown) =>
        done({ data: ids.filter((id) => id === REVIEW).map((id) => ({ id })), error: null }),
    };
    return q;
  },
};
vi.mock("@/server/admin", () => ({ adminClient: () => db }));

const { sendEmail, sendEmailBatch } = await import("../src/server/email");
const { isReviewShop, reviewDeliverable, REVIEW_NUMBERS_MESSAGE } =
  await import("../src/server/review-shop");
const { sendText } = await import("../src/server/twilio");
const { takeLineNumber, keepLineNumber, findLineNumbers } =
  await import("../src/server/phone-line");

const base = {
  from: '"Palo Verde Pool Service via Sundeck Pro" <reports@send.sundeckpro.com>',
  replyTo: "appreview@sundeckpro.com",
  subject: "Your invoice",
  html: "<p>Hi</p>",
  text: "Hi",
};

let outbox: string;
const sentFiles = async () =>
  Promise.all(
    (await readdir(outbox)).map(async (f) => JSON.parse(await readFile(join(outbox, f), "utf8"))),
  );

beforeEach(async () => {
  tables.length = 0;
  outbox = await mkdtemp(join(tmpdir(), "review-outbox-"));
  process.env.EMAIL_OUTBOX_DIR = outbox;
});
afterEach(() => {
  delete process.env.EMAIL_OUTBOX_DIR;
  delete process.env.RESEND_API_KEY;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  vi.unstubAllGlobals();
});

describe("which addresses the App Review shop's email reaches", () => {
  it("is sundeckpro.com itself, never a look-alike", () => {
    expect(reviewDeliverable("appreview@sundeckpro.com")).toBe(true);
    expect(reviewDeliverable(" Riley@SundeckPro.com ")).toBe(true);
    expect(reviewDeliverable("sam@example.com")).toBe(false);
    expect(reviewDeliverable("x@sundeckpro.com.evil.test")).toBe(false);
    expect(reviewDeliverable("x@mail.sundeckpro.com")).toBe(false);
    expect(reviewDeliverable("sundeckpro.com")).toBe(false);
  });

  it("knows the review shop from other shops", async () => {
    expect(await isReviewShop(REVIEW)).toBe(true);
    expect(await isReviewShop(OTHER)).toBe(false);
    expect(await isReviewShop(null)).toBe(false);
  });
});

describe("the App Review shop's email", () => {
  it("is recorded as sent but delivered nowhere", async () => {
    const sent = await sendEmail({ ...base, companyId: REVIEW, to: "sam@example.com" });
    expect(sent.id).toMatch(/^review-/);
    expect(await sentFiles()).toEqual([]);
  });

  it("never calls Resend, even with a key", async () => {
    process.env.RESEND_API_KEY = "re_live";
    const resend = vi.fn();
    const sent = await sendEmail(
      { ...base, companyId: REVIEW, to: "sam@example.com", cc: ["pat@example.com"] },
      resend as unknown as typeof fetch,
    );
    expect(sent.id).toMatch(/^review-/);
    expect(resend).not.toHaveBeenCalled();
  });

  it("still reaches sundeckpro.com, and only that", async () => {
    await sendEmail({
      ...base,
      companyId: REVIEW,
      to: "sam@example.com",
      cc: ["qa@sundeckpro.com", "pat@example.com"],
    });
    const [only, ...more] = await sentFiles();
    expect(more).toEqual([]);
    expect(only).toMatchObject({ to: "qa@sundeckpro.com", cc: [] });
  });

  it("other shops' email goes as before", async () => {
    await sendEmail({ ...base, companyId: OTHER, to: "sam@example.com" });
    expect((await sentFiles()).map((e) => e.to)).toEqual(["sam@example.com"]);
  });

  it("a mass email holds the review shop's and sends the rest, in order", async () => {
    const results = await sendEmailBatch([
      { ...base, companyId: REVIEW, to: "a@example.com" },
      { ...base, companyId: OTHER, to: "b@example.com" },
      { ...base, companyId: REVIEW, to: "qa@sundeckpro.com" },
    ]);
    expect(results.map((r) => ("id" in r ? r.id.split("-")[0] : "error"))).toEqual([
      "review",
      "outbox",
      "outbox",
    ]);
    expect((await sentFiles()).map((e) => e.to).sort()).toEqual([
      "b@example.com",
      "qa@sundeckpro.com",
    ]);
  });
});

describe("the App Review shop's texts and number", () => {
  it("texts are recorded as sent (demo mode) and never reach Twilio, even with keys", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_live";
    process.env.TWILIO_AUTH_TOKEN = "live";
    const twilio = vi.fn();
    vi.stubGlobal("fetch", twilio);
    const sent = await sendText(
      { from: "+16025550100", to: "+16025550110", body: "On my way" },
      { hold: true },
    );
    expect(sent).toMatchObject({ status: "sent" });
    expect(sent.sid).toMatch(/^demo-/);
    expect(twilio).not.toHaveBeenCalled();
  });

  it("can't search for, buy, or set up a number", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_live";
    process.env.TWILIO_AUTH_TOKEN = "live";
    const twilio = vi.fn();
    vi.stubGlobal("fetch", twilio);
    // The owner's own client: the shop isn't locked.
    const user = { rpc: async () => ({ data: { locked: false }, error: null }) };
    const asOwner = user as unknown as Parameters<typeof takeLineNumber>[0];
    expect(await findLineNumbers(REVIEW, "602")).toEqual({ error: REVIEW_NUMBERS_MESSAGE });
    expect(await takeLineNumber(asOwner, REVIEW, "+16025550147", "https://x.test")).toEqual({
      error: REVIEW_NUMBERS_MESSAGE,
    });
    expect(await keepLineNumber(asOwner, REVIEW, "(602) 555-0147")).toEqual({
      error: REVIEW_NUMBERS_MESSAGE,
    });
    expect(REVIEW_NUMBERS_MESSAGE).toBe("Phone numbers can’t be added to the App Review shop.");
    expect(twilio).not.toHaveBeenCalled();
    // Only the shop was read: no line was reserved.
    expect(tables.every((t) => t === "company")).toBe(true);
  });
});
