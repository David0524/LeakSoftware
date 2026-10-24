import { cardImageResponse } from "@/server/link-preview";

// The invoice's link-preview card (server/link-preview.tsx): what Messages, Mail and Slack show.
export async function GET(request: Request, ctx: RouteContext<"/i/[token]/card.png">) {
  const { token } = await ctx.params;
  return cardImageResponse("invoice", token, new URL(request.url).searchParams.get("v"));
}
