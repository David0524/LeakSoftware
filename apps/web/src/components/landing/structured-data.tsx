import { DEFAULT_PRICES, type PriceList } from "@leakbook/core";
import { COMPANY, CONTACT_EMAIL, CONTACT_PHONE_URL } from "@/lib/site";

const PHONE = CONTACT_PHONE_URL.replace("tel:", "");

const SITE = "https://sundeckpro.com";
/** The iPhone app on the App Store (approved 2026-11-05). */
export const APP_STORE_URL = "https://apps.apple.com/us/app/sundeck-pro/id6824555420";
/** The Android app on Google Play (approved 2026-11-16). */
export const GOOGLE_PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.sundeckpro.app&hl=en_US";

const tierDollars = (p: PriceList) =>
  [p.maintenance, p.leak].flatMap((plan) => plan.tiers.map((t) => t.priceCents / 100));

/**
 * The home page's description for search engines (schema.org JSON-LD; owner, 2026-11-06:
 * "optimize our SEO"): who makes Sundeck Pro and how to reach them, the site, and the product
 * with its price range, read from the same plans and contact details the page shows. Not drawn.
 */
export const STRUCTURED_DATA = structuredData(DEFAULT_PRICES);

/** The JSON-LD for a price list (the published one: staff set prices in Admin › Pricing). */
export function structuredData(priceList: PriceList) {
  const prices = tierDollars(priceList);
  return {
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
        sameAs: [APP_STORE_URL, GOOGLE_PLAY_URL],
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
        installUrl: [APP_STORE_URL, GOOGLE_PLAY_URL],
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
}

export function StructuredData({ prices }: { prices: PriceList }) {
  return (
    <script
      type="application/ld+json"
      // JSON from our own constants; "<" is escaped so no text can close the script early.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData(prices)).replace(/</g, "\\u003c"),
      }}
    />
  );
}
