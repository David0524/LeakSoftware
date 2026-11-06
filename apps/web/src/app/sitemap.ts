import type { MetadataRoute } from "next";

const SITE = "https://sundeckpro.com";

/** The public pages search engines should list (robots.ts names the rest as off limits). */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/sign-up`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/security`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/status`, changeFrequency: "daily", priority: 0.2 },
    { url: `${SITE}/sign-in`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
