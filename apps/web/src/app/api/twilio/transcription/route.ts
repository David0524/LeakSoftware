import { forbidden, ok, twilioParams } from "@/server/twilio-route";
import { voicemailTranscribed } from "@/server/texting";

/** A voicemail's transcript. */
export async function POST(request: Request) {
  const t = await twilioParams(request);
  if (!t) return forbidden();
  await voicemailTranscribed(t.params);
  return ok();
}
