import { ok, twilioParams } from "@/server/twilio-route";
import { voicemailRecorded } from "@/server/texting";

/** A voicemail was recorded. */
export async function POST(request: Request) {
  const t = await twilioParams(request);
  if (t instanceof Response) return t;
  await voicemailRecorded(t.params);
  return ok();
}
