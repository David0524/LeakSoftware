// "By creating an account, you agree to the Terms and Privacy Policy." under the create button
// of every sign-up (owner, 2026-10-24, for the App Store launch): the website's Start Free Trial
// and Join Your Team, and Create an Account in the iPhone and Android apps. "Terms" and
// "Privacy Policy" link to https://sundeckpro.com/terms and /privacy (the apps open them in
// their in-app browser). Swift copy in SundeckCore/TermsConsent.swift, checked by the
// terms-consent fixtures. The server records when an account agreed (profile.accepted_terms_at).

export const TERMS_CONSENT = {
  before: "By creating an account, you agree to the ",
  terms: "Terms",
  between: " and ",
  privacy: "Privacy Policy",
  after: ".",
  /** Paths on the Sundeck Pro website. */
  termsPath: "/terms",
  privacyPath: "/privacy",
} as const;

/** The sentence as one string (screen readers, tests). */
export function termsConsentText(): string {
  const c = TERMS_CONSENT;
  return `${c.before}${c.terms}${c.between}${c.privacy}${c.after}`;
}
