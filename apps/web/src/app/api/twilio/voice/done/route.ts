import { twiml } from "@/server/twilio";
import { forbidden, twilioParams } from "@/server/twilio-route";

/** The caller finished their voicemail. */
export async function POST(request: Request) {
  const t = await twilioParams(request);
  if (!t) return forbidden();
  return twiml("<Hangup/>");
}
