import { expect, type APIRequestContext } from "@playwright/test";
import { adminClient } from "./backend";

/** What Messages and Mail send when they fetch a link's preview (Apple's LinkPresentation). */
export const MESSAGES_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0";

const meta = (html: string, key: string) =>
  new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html)?.[1] ?? null;

/**
 * A customer link previews the document (owner, 2026-10-24): its own card image and title, never
 * Sundeck Pro's clip, and the fetch counts no view.
 */
export async function expectDocumentPreview(
  request: APIRequestContext,
  link: string,
  title: RegExp,
) {
  const path = new URL(link).pathname;
  const token = path.split("/").pop()!;
  const admin = adminClient();
  const views = async () =>
    (await admin!.from("share_link").select("view_count").eq("token", token).single()).data
      ?.view_count as number;
  const before = admin ? await views() : 0;

  const page = await request.get(path, { headers: { "user-agent": MESSAGES_UA } });
  expect(page.ok()).toBe(true);
  const html = await page.text();
  const head = html.slice(0, html.indexOf("</head>"));
  expect(meta(head, "og:title")).toMatch(title);
  expect(meta(head, "og:description")).toBeTruthy();
  const image = meta(head, "og:image");
  expect(image).toMatch(new RegExp(`${path}/card\\.png\\?v=[0-9a-f]{16}$`));
  expect(meta(head, "og:image:width")).toBe("1200");
  expect(meta(head, "og:image:height")).toBe("630");
  expect(meta(head, "twitter:card")).toBe("summary_large_image");
  // No clip: that's for Sundeck Pro's own pages.
  expect(html).not.toContain("og:video");
  expect(html).not.toContain("sundeck-pro.mp4");

  const card = await request.get(new URL(image!).pathname + new URL(image!).search, {
    headers: { "user-agent": MESSAGES_UA },
  });
  expect(card.status()).toBe(200);
  expect(card.headers()["content-type"]).toBe("image/png");
  expect(card.headers()["cache-control"]).toMatch(/^public, max-age=/);
  expect((await card.body()).subarray(1, 4).toString()).toBe("PNG");

  if (admin) expect(await views()).toBe(before);
}
