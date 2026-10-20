import { twilioParams } from "@/server/twilio-route";
import { incomingCall } from "@/server/texting";

/** A customer calls the company number: ring the team, or voicemail. */
export async function POST(request: Request) {
  const t = await twilioParams(request);
  if (t instanceof Response) return t;
  return incomingCall(t.params, t.origin);
}
