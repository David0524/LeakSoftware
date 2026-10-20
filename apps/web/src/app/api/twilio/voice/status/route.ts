import { ok, twilioParams } from "@/server/twilio-route";
import { callStatus } from "@/server/texting";

/** Progress of calls the team placed. */
export async function POST(request: Request) {
  const t = await twilioParams(request);
  if (t instanceof Response) return t;
  await callStatus(t.params);
  return ok();
}
