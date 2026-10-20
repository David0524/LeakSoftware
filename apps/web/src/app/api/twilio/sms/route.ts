import { twilioParams } from "@/server/twilio-route";
import { receiveText } from "@/server/texting";

/** A customer texts the company number. */
export async function POST(request: Request) {
  const t = await twilioParams(request);
  if (t instanceof Response) return t;
  return receiveText(t.params);
}
