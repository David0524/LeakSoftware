import { ok, twilioParams } from "@/server/twilio-route";
import { textStatus } from "@/server/texting";

/** Delivery updates for texts the shop sent. */
export async function POST(request: Request) {
  const t = await twilioParams(request);
  if (t instanceof Response) return t;
  await textStatus(t.params);
  return ok();
}
