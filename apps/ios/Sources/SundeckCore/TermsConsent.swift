import Foundation

// "By creating an account, you agree to the Terms and Privacy Policy." under Create Account
// (owner, 2026-10-24, for the App Store launch), the same on the website and both apps. Port of
// terms-consent.ts; the terms-consent fixtures check the two match.

public struct TermsConsent: Codable, Equatable, Sendable {
    public let before: String
    public let terms: String
    public let between: String
    public let privacy: String
    public let after: String
    /// Paths on the Sundeck Pro website.
    public let termsPath: String
    public let privacyPath: String
}

public let termsConsent = TermsConsent(
    before: "By creating an account, you agree to the ",
    terms: "Terms",
    between: " and ",
    privacy: "Privacy Policy",
    after: ".",
    termsPath: "/terms",
    privacyPath: "/privacy"
)

/// The sentence as one string (VoiceOver, tests).
public func termsConsentText() -> String {
    let c = termsConsent
    return c.before + c.terms + c.between + c.privacy + c.after
}
