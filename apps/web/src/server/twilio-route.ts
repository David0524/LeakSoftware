import "server-only";
import { siteOrigin } from "@/lib/origin";
import { validTwilioRequest } from "./twilio";

/**
 * A Twilio webhook's form parameters, or the response refusing it: 400 when the body isn't a
 * form (Twilio always posts one), 403 when its signature doesn't match (the URL Twilio signed
 * is the public one: our origin plus the path and query).
 */
export async function twilioParams(
  request: Request,
): Promise<{ params: Record<string, string>; origin: string } | Response> {
  const form = await request.formData().catch(() => null);
  if (!form) return new Response("Send a form.", { status: 400 });
  const params: Record<string, string> = {};
  for (const [k, v] of form) if (typeof v === "string") params[k] = v;
  const origin = await siteOrigin();
  const url = new URL(request.url);
  const signed = `${origin}${url.pathname}${url.search}`;
  if (!validTwilioRequest(signed, params, request.headers.get("x-twilio-signature")))
    return forbidden();
  return { params, origin };
}

export const forbidden = () => new Response("Bad signature", { status: 403 });
export const ok = () => new Response(null, { status: 204 });
