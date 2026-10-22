import { publicClient } from "@/server/reports";

/**
 * POST: the one-click unsubscribe a mail app sends from a mass email's List-Unsubscribe header
 * (RFC 8058). No sign-in; the token names one recipient. The link in the email opens
 * /unsubscribe/<token>, a page with one button, so link scanners can't unsubscribe people.
 */
export async function POST(_: Request, { params }: RouteContext<"/api/unsubscribe/[token]">) {
  const { token } = await params;
  const { data, error } = await publicClient().rpc("unsubscribe_email", { link_token: token });
  if (error) return Response.json({ error: "Try again." }, { status: 500 });
  if (!data) return Response.json({ error: "This link no longer works." }, { status: 404 });
  return Response.json({ ok: true });
}
