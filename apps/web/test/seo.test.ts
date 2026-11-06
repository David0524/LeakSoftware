import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { STRUCTURED_DATA } from "@/components/landing/structured-data";

describe("search engines", () => {
  it("keep customer links, the office and sign-in steps out of results", () => {
    const rules = robots().rules;
    const disallow = (Array.isArray(rules) ? rules[0]! : rules).disallow as string[];
    for (const path of [
      "/q/",
      "/i/",
      "/r/",
      "/stop/",
      "/unsubscribe/",
      "/api/",
      "/admin",
      "/jobs",
      "/in-app/",
    ]) {
      expect(disallow).toContain(path);
    }
    expect(robots().sitemap).toBe("https://sundeckpro.com/sitemap.xml");
  });

  it("list only public pages, none of them blocked", () => {
    const disallow = (robots().rules as { disallow: string[] }).disallow;
    const paths = sitemap().map((e) => new URL(e.url).pathname);
    expect(paths).toContain("/");
    expect(paths).toContain("/sign-up");
    for (const p of paths) expect(disallow.some((d) => p.startsWith(d))).toBe(false);
  });

  it("describe the business with its phone and the app's price range", () => {
    const graph = STRUCTURED_DATA["@graph"];
    const org = graph.find((n) => n["@type"] === "Organization")!;
    expect(org).toMatchObject({ telephone: "+17027851548", legalName: "Sundeck Pro, LLC" });
    const app = graph.find((n) => n["@type"] === "SoftwareApplication") as { offers: object };
    expect(app.offers).toMatchObject({ priceCurrency: "USD", lowPrice: 49, highPrice: 249 });
  });
});
