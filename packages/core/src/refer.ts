// Refer a Pool Company (owner, 2026-11-23: "Referral links should be more visible. Add it in the
// more section but in a color that differs from all of the other buttons there"). The iPhone and
// Android More tabs show owners a row in the brand's orange that opens the share sheet with the
// shop's referral link. The website's sign-up page shows the offer and applies the code.
//
// App Review (docs/release/APP_STORE.md § 7, rules 3.1.1 and 3.1.3(f)): nothing here mentions
// money, a trial, a free month or subscribing, in the row, its subtitle, the share message or the
// accessibility label. The website's Give a Month, Get a Month card (codes.ts) says the offer.
//
// The iPhone's copy (SundeckCore/Refer.swift) is checked against this one by the refer fixtures.

/** The row's words, the same on both apps. */
export const REFER_COPY = {
  title: "Refer a Pool Company",
  subtitle: "Share Sundeck Pro with another pool company.",
  /** What VoiceOver and TalkBack say after the title and subtitle: the row opens the share sheet. */
  hint: "Opens the share sheet.",
} as const;

/** A shop's referral code as the link carries it: letters and numbers, capitals. */
function cleanCode(code: string | null | undefined): string {
  return (code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * The referral link, `https://sundeckpro.com/sign-up?code=BLUEWAVEPOOLS`, on the website the app
 * talks to (its trailing slash dropped). "" when there's no code or no website.
 */
export function referralLink(
  webUrl: string | null | undefined,
  code: string | null | undefined,
): string {
  const site = (webUrl ?? "").trim().replace(/\/+$/, "");
  const clean = cleanCode(code);
  return site && clean ? `${site}/sign-up?code=${clean}` : "";
}

/** The share sheet's message: the words, then the link. */
export function referShareMessage(link: string): string {
  return `Try Sundeck Pro for your pool business: ${link}`;
}

/**
 * Whether More shows the row: the shop's owners only (the people `referral_summary` answers),
 * and only once the server gave a code. No code, an error or offline: no row.
 */
export function showsReferRow(
  role: string | null | undefined,
  code: string | null | undefined,
): boolean {
  return role === "owner" && cleanCode(code).length > 0;
}
