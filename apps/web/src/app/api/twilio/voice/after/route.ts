import { forbidden, twilioParams } from "@/server/twilio-route";
import { afterDial } from "@/server/texting";

/** After the team's phones rang: answered, or on to voicemail. */
export async function POST(request: Request) {
  const t = await twilioParams(request);
  if (!t) return forbidden();
  return afterDial(t.params, t.origin);
}
