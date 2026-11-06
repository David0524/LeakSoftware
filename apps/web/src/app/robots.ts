import type { MetadataRoute } from "next";

/**
 * What search engines may crawl (owner, 2026-11-06: "optimize our SEO"): the public pages. The
 * office, staff portal, sign-in flows, API, and every customer link (reports, quotes, invoices,
 * sign-offs, unsubscribes) stay out; customer pages also carry noindex themselves.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/admin",
        "/in-app/",
        "/invite/",
        "/i/",
        "/q/",
        "/r/",
        "/maps",
        "/sign-off",
        "/stop/",
        "/unsubscribe/",
        "/weekly-summary",
        "/reset-password",
        "/forgot-password",
        "/sign-in/",
        "/setup",
        "/activity",
        "/chemicals",
        "/dashboard",
        "/invoices",
        "/messages",
        "/home",
        "/jobs",
        "/customers",
        "/schedule",
        "/today",
        "/settings",
        "/more",
      ],
    },
    sitemap: "https://sundeckpro.com/sitemap.xml",
    host: "https://sundeckpro.com",
  };
}
