import { PLANS } from "@leakbook/core";
import { COMPANY, CONTACT_EMAIL, CONTACT_PHONE_URL } from "@/lib/site";

const PHONE = CONTACT_PHONE_URL.replace("tel:", "");

const SITE = "https://sundeckpro.com";
/** The iPhone app on the App Store (approved 2026-11-05). Android joins `sameAs` once it's on Play. */
export const APP_STORE_URL = "https://apps.apple.com/us/app/sundeck-pro/id6824555420";

const prices = Object.values(PLANS).flatMap((p) => p.tiers.map((t) => t.priceCents / 100));

/**
 * The home page's description for search engines (schema.org JSON-LD; owner, 2026-11-06:
 * "optimize our SEO"): who makes Sundeck Pro and how to reach them, the site, and the product
 * with its price range, read from the same plans and contact details the page shows. Not drawn.
 */
export const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE}/#organization`,
      name: "Sundeck Pro",
      legalName: COMPANY.legalName,
      url: SITE,
      logo: `${SITE}/icons/icon-512.png`,
      email: CONTACT_EMAIL,
      telephone: PHONE,
      sameAs: [APP_STORE_URL],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        telephone: PHONE,
        email: CONTACT_EMAIL,
        areaServed: "US",
        availableLanguage: "English",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      name: "Sundeck Pro",
      url: SITE,
      publisher: { "@id": `${SITE}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      name: "Sundeck Pro",
      url: SITE,
      description:
        "Software for pool service and leak detection shops: routes and scheduling, service and leak checklists, reports, quotes, invoices and payments, on iPhone, Android and the web.",
      applicationCategory: "BusinessApplication",
      operatingSystem: "iOS, Android, Web",
      image: `${SITE}/og/sundeck-pro.jpg`,
      installUrl: APP_STORE_URL,
      publisher: { "@id": `${SITE}/#organization` },
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "USD",
        lowPrice: Math.min(...prices),
        highPrice: Math.max(...prices),
        offerCount: prices.length,
      },
    },
  ],
};

export function StructuredData() {
  return (
    <script
      type="application/ld+json"
      // JSON from our own constants; "<" is escaped so no text can close the script early.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA).replace(/</g, "\\u003c") }}
    />
  );
}
