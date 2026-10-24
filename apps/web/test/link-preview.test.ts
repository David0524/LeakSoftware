import { beforeEach, describe, expect, it, vi } from "vitest";
import { isLinkPreviewFetch } from "@/lib/link-preview-bots";

// The preview lookup, answered here instead of by the database.
const rpc = vi.fn();
vi.mock("@/server/reports", () => ({ publicClient: () => ({ rpc }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { documentMetadata, imageSize, svgHasLiveText } = await import("@/server/link-preview");

const TOKEN = "0123456789abcdef0123456789abcdef";

describe("isLinkPreviewFetch", () => {
  it("knows Messages, Mail, Slack, Facebook and the like", () => {
    for (const ua of [
      // Messages and Mail (LinkPresentation)
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "WhatsApp/2.23.20.0",
      "Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5",
      "TelegramBot (like TwitterBot)",
      "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      "Google-PageRenderer Google (+https://developers.google.com/+/web/snippet/)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "okhttp/4.12.0",
      null,
    ])
      expect(isLinkPreviewFetch(ua), String(ua)).toBe(true);
  });

  it("counts people, in browsers and in apps' own browsers", () => {
    for (const ua of [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
      "Mozilla/5.0 (Linux; Android 12; CUBOT P60) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0 Safari/537.36",
    ])
      expect(isLinkPreviewFetch(ua), ua).toBe(false);
  });
});

describe("imageSize", () => {
  it("reads a PNG's size", () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 1200);
    new DataView(png.buffer).setUint32(20, 300);
    expect(imageSize(png, "image/png")).toEqual({ width: 1200, height: 300 });
  });

  it("reads a JPEG's size past its other segments", () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58,
      0x05, 0x78, 0x03, 0, 0, 0, 0, 0, 0,
    ]);
    expect(imageSize(jpeg, "image/jpeg")).toEqual({ width: 1400, height: 600 });
  });

  it("reads an SVG's size from width and height, else its viewBox", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(imageSize(enc('<svg width="520" height="140"></svg>'), "image/svg+xml")).toEqual({
      width: 520,
      height: 140,
    });
    expect(imageSize(enc('<svg viewBox="0 0 100 146.3"></svg>'), "image/svg+xml")).toEqual({
      width: 100,
      height: 146.3,
    });
    expect(imageSize(enc("<svg></svg>"), "image/svg+xml")).toBeNull();
  });

  it("spots an SVG whose letters are live text", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(svgHasLiveText(enc('<svg><text x="1">Sunrise</text></svg>'))).toBe(true);
    expect(svgHasLiveText(enc('<svg><path d="M0 0"/><textPath/></svg>'))).toBe(false);
  });
});

describe("documentMetadata", () => {
  beforeEach(() => rpc.mockReset());

  it("gives a quote's page its card, title and line, and no video", async () => {
    rpc.mockResolvedValue({
      data: {
        kind: "quote",
        live: true,
        shop: "Bluefin Pool Co.",
        logo_path: null,
        timezone: "America/New_York",
        status: "sent",
        total_cents: 124000,
        valid_until: "2026-11-15",
        customer: "Dana Ruiz",
        address: "123 Palm Ave, Tampa, FL 33601",
      },
      error: null,
    });
    const m = await documentMetadata("quote", TOKEN, "Repair Quote");
    expect(rpc).toHaveBeenCalledWith("link_preview_for_token", { link_token: TOKEN });
    expect(m.title).toBe("Repair Quote");
    expect(m.robots).toEqual({ index: false });
    expect(m.openGraph?.title).toBe("Bluefin Pool Co.: Quote for Dana Ruiz");
    expect(m.openGraph?.description).toMatch(/^\$1,240\.00 · Good through Nov 15(, 2026)?$/);
    const images = m.openGraph?.images as { url: string; width: number; height: number }[];
    expect(images[0]!.url).toMatch(new RegExp(`^/q/${TOKEN}/card\\.png\\?v=[0-9a-f]{16}$`));
    expect(images[0]).toMatchObject({ width: 1200, height: 630 });
    expect(JSON.stringify(m)).not.toContain("mp4");
    expect(m.openGraph).not.toHaveProperty("videos");
  });

  it("keeps the plain title when the link is unknown or is another kind", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await documentMetadata("invoice", TOKEN, "Invoice")).toEqual({
      title: "Invoice",
      robots: { index: false },
    });
    rpc.mockResolvedValue({ data: { kind: "quote", live: false, shop: "X" }, error: null });
    expect((await documentMetadata("invoice", TOKEN, "Invoice")).openGraph).toBeUndefined();
  });

  it("never asks about a malformed token", async () => {
    expect(await documentMetadata("report", "not-a-token", "Report")).toEqual({
      title: "Report",
      robots: { index: false },
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
