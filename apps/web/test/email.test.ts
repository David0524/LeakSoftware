import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EmailNotConfigured, fromAddress, sendEmail } from "../src/server/email";

const email = {
  from: fromAddress('Demo "Leak" Co.'),
  to: "sam@example.com",
  replyTo: "office@demo.test",
  subject: "Your report",
  html: "<p>Hi</p>",
  text: "Hi",
  attachments: [{ filename: "r.pdf", content: Buffer.from("%PDF-1.7") }],
};

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_OUTBOX_DIR;
  delete process.env.EMAIL_FROM_DOMAIN;
});

describe("sendEmail", () => {
  it("sends from the shop via LeakBook with replies to the shop", async () => {
    process.env.EMAIL_FROM_DOMAIN = "send.example.com";
    expect(fromAddress("Demo Leak Co.")).toBe(
      '"Demo Leak Co. via LeakBook" <reports@send.example.com>',
    );
    process.env.RESEND_API_KEY = "re_test";
    let sent: { url: string; init: RequestInit } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return Response.json({ id: "email_1" });
    }) as unknown as typeof fetch;
    expect(await sendEmail(email, fake)).toEqual({ id: "email_1" });
    const body = JSON.parse(String(sent!.init.body));
    expect(sent!.url).toBe("https://api.resend.com/emails");
    expect(new Headers(sent!.init.headers).get("authorization")).toBe("Bearer re_test");
    expect(body).toMatchObject({
      to: ["sam@example.com"],
      reply_to: "office@demo.test",
      subject: "Your report",
    });
    expect(body.from).toBe('"Demo Leak Co. via LeakBook" <reports@send.leakbook.com>');
    expect(body.attachments[0]).toEqual({
      filename: "r.pdf",
      content: Buffer.from("%PDF-1.7").toString("base64"),
    });
  });

  it("reports Resend errors", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const fake = (async () =>
      Response.json(
        { message: "Domain not verified" },
        { status: 403 },
      )) as unknown as typeof fetch;
    await expect(sendEmail(email, fake)).rejects.toThrow("Domain not verified");
  });

  it("writes to the test outbox when configured, and refuses without either", async () => {
    await expect(sendEmail(email)).rejects.toBeInstanceOf(EmailNotConfigured);
    const dir = await mkdtemp(join(tmpdir(), "outbox-"));
    process.env.EMAIL_OUTBOX_DIR = dir;
    const { id } = await sendEmail(email);
    const [file] = await readdir(dir);
    expect(file).toBe(`${id}.json`);
    const saved = JSON.parse(await readFile(join(dir, file!), "utf8"));
    expect(saved).toMatchObject({
      to: "sam@example.com",
      attachments: [{ filename: "r.pdf", bytes: 8 }],
    });
  });
});
