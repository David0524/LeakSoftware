import { ImageResponse } from "next/og";
import { tokens } from "@leakbook/tokens";

// A map pin as a small PNG for Apple's map images (owner, 2026-10-22: the snapshot's own pins
// "look huge and cartoony"): the live map's pin, a 28 pt circle with a white ring, numbered in
// its stop's color, or the start as a navy circle with a house. Apple fetches these while it
// draws a snapshot, so they're public and kept for a year; they show nothing about a job.
// Drawn at 2x (56 px) for sharp edges. Names: "todo-3", "done-1", "current-2", "shop", "home".

const COLOR = {
  shop: tokens.color.brand.navy,
  home: tokens.color.brand.navy,
  todo: tokens.color.brand.water,
  current: tokens.color.brand.safety,
  done: tokens.color.status.pass,
} as const;

const NAME = /^(?:(todo|current|done)-([1-9])|(shop|home))\.png$/;

export async function GET(_req: Request, ctx: { params: Promise<{ pin: string }> }) {
  const m = NAME.exec((await ctx.params).pin);
  if (!m) return new Response("Not found", { status: 404 });
  const tone = (m[1] ?? m[3]) as keyof typeof COLOR;
  const label = m[2];
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: 56,
        height: 56,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          width: 52,
          height: 52,
          borderRadius: 9999,
          border: "4px solid #fff",
          background: COLOR[tone],
          color: "#fff",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 26,
          fontWeight: 700,
          boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
        }}
      >
        {label ?? (
          <svg
            viewBox="0 0 24 24"
            width="30"
            height="30"
            fill="none"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 11l8-7 8 7" />
            <path d="M6 10v10h12V10" />
          </svg>
        )}
      </div>
    </div>,
    {
      width: 56,
      height: 56,
      headers: { "cache-control": "public, max-age=31536000, immutable" },
    },
  );
}
