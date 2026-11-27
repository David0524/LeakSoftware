import { siteOrigin } from "@/lib/origin";
import { bearerSession, jsonError } from "@/server/bearer";
import { isManager, memberRole } from "@/server/bearer-member";
import {
  UPDATE_TO_REGISTER,
  cancelLineNumber,
  findLineNumbers,
  phoneSettings,
  saveLineSettings,
  saveOwnPhone,
} from "@/server/phone-line";
import { startRegistration, updateRegistration } from "@/server/texting-registration";

// Settings › Phone and Texting in the apps (owner, 2026-10-20: "From the app, do not link to
// the website"), the same rules as the website's page.

/** GET ?company_id=: the company number, my mobile number, and whose phones ring. */
export async function GET(request: Request) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const companyId = new URL(request.url).searchParams.get("company_id");
  if (!(await memberRole(session, companyId)))
    return jsonError("You’re not on this shop’s team.", 403);
  return Response.json(await phoneSettings(session.db, companyId!, session.userId));
}

/**
 * POST { company_id, action, ... }: search (area_code), register (kind, number, business),
 * update (business: new details after a review came back), cancel, save (pictures,
 * ring_user_ids, voicemail_greeting), my_phone (phone). All but my_phone are for owners and
 * admins. take and keep (apps from before registrations) ask to update.
 */
export async function POST(request: Request) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("Send JSON.", 400);
  const companyId = body.company_id;
  const role = await memberRole(session, companyId);
  if (!role) return jsonError("You’re not on this shop’s team.", 403);
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const id = companyId as string;

  if (body.action === "my_phone")
    return reply(await saveOwnPhone(session.db, session.userId, str("phone")));
  if (!isManager(role))
    return jsonError("Only owners and admins can change the company number.", 403);
  switch (body.action) {
    case "search": {
      const found = await findLineNumbers(id, str("area_code"));
      return "error" in found ? jsonError(found.error, 400) : Response.json(found);
    }
    case "register":
      return reply(
        await startRegistration(
          session.db,
          id,
          session.userId,
          { kind: body.kind, number: body.number, business: business(body.business) },
          await siteOrigin(),
        ),
      );
    case "update":
      return reply(
        await updateRegistration(session.db, id, business(body.business), await siteOrigin()),
      );
    case "take":
    case "keep":
      return jsonError(UPDATE_TO_REGISTER, 400);
    case "cancel":
      return reply(await cancelLineNumber(id));
    case "save":
      return reply(
        await saveLineSettings(session.db, id, {
          pictures: body.pictures === true,
          ringUserIds: Array.isArray(body.ring_user_ids)
            ? body.ring_user_ids.filter((x): x is string => typeof x === "string")
            : [],
          greeting: str("voicemail_greeting"),
        }),
      );
    default:
      return jsonError("Unknown action.", 400);
  }
}

function reply(result: { message: string } | { error: string; fields?: Record<string, string> }) {
  return "error" in result ? Response.json(result, { status: 400 }) : Response.json(result);
}

/** The business details as sent: an object of strings, or nothing. */
function business(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
