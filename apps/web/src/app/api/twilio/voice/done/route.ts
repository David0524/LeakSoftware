import { twiml } from "@/server/twilio";
import { twilioParams } from "@/server/twilio-route";

/** The caller finished their voicemail. */
export async function POST(request: Request) {
  const t = await twilioParams(request);
  if (t instanceof Response) return t;
  return twiml("<Hangup/>");
}
