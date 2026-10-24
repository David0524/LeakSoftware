import { cardImageResponse } from "@/server/link-preview";

// The report's link-preview card (server/link-preview.tsx): what Messages, Mail and Slack show.
export async function GET(request: Request, ctx: RouteContext<"/r/[token]/card.png">) {
  const { token } = await ctx.params;
  return cardImageResponse("report", token, new URL(request.url).searchParams.get("v"));
}
