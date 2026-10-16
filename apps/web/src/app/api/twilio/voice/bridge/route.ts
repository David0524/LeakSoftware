import { forbidden, twilioParams } from "@/server/twilio-route";
import { bridgeTwiml } from "@/server/texting";

/** A team member picked up a call they placed: connect them to the customer. */
export async function POST(request: Request) {
  const t = await twilioParams(request);
  if (!t) return forbidden();
  return bridgeTwiml(t.params, new URL(request.url).searchParams.get("to") ?? "");
}
