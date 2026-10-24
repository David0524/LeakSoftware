// Sundeck Pro's own contact details (M11). Set SUPPORT_EMAIL to override the mailbox.
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@sundeckpro.com";

/** Where shops and visitors reach Sundeck Pro (owner, 2026-10-19: "Add a contact us"). */
export const CONTACT_EMAIL = "office@sundeckpro.com";

/**
 * The company behind Sundeck Pro (owner, 2026-10-24; docs/DECISIONS.md). The privacy policy,
 * the terms, the site's footer and the App Store copyright line (docs/release/APP_STORE.md)
 * all read it, so a change here (a new address, the year) is made once.
 */
export const COMPANY = {
  legalName: "Sundeck Pro, LLC",
  /** State of organization; the terms are governed by its law. */
  state: "Nevada",
  /** Where disputes under the terms are heard. */
  venue: "Clark County, Nevada",
  mailingAddress: "8450 W Charleston Blvd, Las Vegas, NV 89117",
  copyrightYear: 2026,
} as const;

/** "© 2026 Sundeck Pro, LLC": the website's footer and App Store Connect's Copyright field. */
export const COPYRIGHT = `© ${COMPANY.copyrightYear} ${COMPANY.legalName}`;
