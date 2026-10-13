import { BadSignature, PaymentsNotConfigured, applyEvent, verifyEvent } from "@/server/stripe";

/** Stripe webhooks (platform and Connect events). Verified, and each event applies once. */
export async function POST(request: Request) {
  const payload = await request.text();
  let event;
  try {
    event = verifyEvent(payload, request.headers.get("stripe-signature"));
  } catch (e) {
    if (e instanceof BadSignature) return new Response("Bad signature", { status: 400 });
    throw e;
  }
  try {
    const outcome = await applyEvent(event);
    return Response.json({ received: true, outcome });
  } catch (e) {
    // A 500 makes Stripe retry later; nothing was claimed, so the retry applies it.
    const status = e instanceof PaymentsNotConfigured ? 503 : 500;
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
