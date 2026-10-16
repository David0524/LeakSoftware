import { createHmac } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { E2E_TWILIO_TOKEN, adminClient } from "./backend";
import { OWNER, RUN, signIn } from "./helpers";

// Company texting and calls (owner, 2026-10-16): the shop takes a number, a customer texts it
// and calls it, and the team answers from the shared inbox. Twilio's webhooks are signed here
// with the started app's auth token; with no Twilio account the app sends nothing (demo mode).

const BASE = `http://localhost:3200`;

/** Twilio's signature: HMAC-SHA1 of the URL and the sorted parameters, in base64. */
function sign(url: string, params: Record<string, string>) {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  return createHmac("sha1", E2E_TWILIO_TOKEN).update(data).digest("base64");
}

function twilio(request: APIRequestContext, path: string, params: Record<string, string>) {
  return request.post(path, {
    form: params,
    headers: { "x-twilio-signature": sign(`${BASE}${path}`, params) },
  });
}

test("customers text and call the company number, and the team answers", async ({
  page,
  request,
}) => {
  test.skip(
    !adminClient() || !!process.env.E2E_BASE_URL,
    "Needs SUPABASE_SERVICE_ROLE_KEY and the started app (CI runs it against Supabase in Docker).",
  );
  test.setTimeout(180_000);
  const admin = adminClient()!;
  // A made-up customer number (555-01xx is reserved for fiction).
  const customer = `+148055501${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`;

  // The owner takes a number.
  await signIn(page, OWNER, "/settings/phone");
  await page.getByLabel("Area code").fill("602");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Use This Number" }).first().click();
  await expect(page.getByText("Working. Texts and calls show up in Messages.")).toBeVisible();
  const { data: line } = await admin
    .from("phone_line")
    .select("id, number")
    .eq("status", "active")
    .like("number", "+1602555%")
    .single();
  expect(line).toBeTruthy();

  try {
    // Only Twilio can post to the webhooks.
    const forged = await request.post("/api/twilio/sms", {
      form: { From: customer, To: line!.number, Body: "hi" },
      headers: { "x-twilio-signature": "forged" },
    });
    expect(forged.status()).toBe(403);

    // A customer texts the shop.
    const text = await twilio(request, "/api/twilio/sms", {
      MessageSid: `SM${RUN}`,
      From: customer,
      To: line!.number,
      Body: `Is the tech still coming today? ${RUN}`,
      NumMedia: "0",
    });
    expect(text.status()).toBe(200);
    expect(await text.text()).toContain("<Response>");

    // The team sees it, unread, and answers from the company number.
    await page.goto("/messages");
    const row = page.getByRole("link", { name: /unread/ }).filter({ hasText: RUN });
    await row.click();
    await expect(page.getByText(`Is the tech still coming today? ${RUN}`)).toBeVisible();
    await page.getByLabel("Message").fill(`Yes, about 20 minutes out. ${RUN}`);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(`Yes, about 20 minutes out. ${RUN}`)).toBeVisible();
    await expect(page.getByText(/· Sent ·/)).toBeVisible();

    // They call; nobody's phone is set up to ring, so it goes to voicemail.
    const call = await twilio(request, "/api/twilio/voice", {
      CallSid: `CA${RUN}`,
      From: customer,
      To: line!.number,
    });
    expect(await call.text()).toContain("<Record");
    expect(
      (
        await twilio(request, "/api/twilio/recording", {
          CallSid: `CA${RUN}`,
          RecordingSid: `RE${RUN}`,
          RecordingStatus: "completed",
          RecordingDuration: "14",
        })
      ).status(),
    ).toBe(204);
    await twilio(request, "/api/twilio/transcription", {
      CallSid: `CA${RUN}`,
      TranscriptionStatus: "completed",
      TranscriptionText: "Call me back about the gate code.",
    });
    await page.reload();
    await expect(page.getByText(/Voicemail · 14 sec/)).toBeVisible();
    await expect(page.getByText("“Call me back about the gate code.”")).toBeVisible();

    // STOP turns texts off for that customer.
    await twilio(request, "/api/twilio/sms", {
      MessageSid: `SM${RUN}stop`,
      From: customer,
      To: line!.number,
      Body: "STOP",
      NumMedia: "0",
    });
    await page.reload();
    await expect(page.getByText(/replied STOP/)).toBeVisible();
    await expect(page.getByLabel("Message")).toHaveCount(0);
  } finally {
    // Give the number back, so the next run takes one again.
    await admin.from("phone_line").update({ status: "released" }).eq("id", line!.id);
  }
});
