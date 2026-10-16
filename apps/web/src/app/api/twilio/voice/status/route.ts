import { forbidden, ok, twilioParams } from "@/server/twilio-route";
import { callStatus } from "@/server/texting";

/** Progress of calls the team placed. */
export async function POST(request: Request) {
  const t = await twilioParams(request);
  if (!t) return forbidden();
  await callStatus(t.params);
  return ok();
}
