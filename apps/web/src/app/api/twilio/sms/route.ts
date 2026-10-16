import { forbidden, twilioParams } from "@/server/twilio-route";
import { receiveText } from "@/server/texting";

/** A customer texts the company number. */
export async function POST(request: Request) {
  const t = await twilioParams(request);
  if (!t) return forbidden();
  return receiveText(t.params);
}
