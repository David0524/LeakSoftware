import Foundation

// Refer a Pool Company (owner, 2026-11-23): an orange row on More, owners only, that opens the share
// sheet with the shop's referral link. Port of refer.ts; the refer fixtures check the two match.
// Nothing here mentions money, a trial or subscribing (App Store rules 3.1.1 and 3.1.3(f)).

/// `REFER_COPY`: the row's words, the same on both apps.
public enum ReferCopy {
    public static let title = "Refer a Pool Company"
    public static let subtitle = "Share Sundeck Pro with another pool company."
    /// What VoiceOver says after the title and subtitle: the row opens the share sheet.
    public static let hint = "Opens the share sheet."

    /// All of it, keyed as in TypeScript.
    public static let all: [String: String] = ["title": title, "subtitle": subtitle, "hint": hint]
}

/// A shop's referral code as the link carries it: letters and numbers, capitals.
private func cleanReferralCode(_ code: String?) -> String {
    let allowed = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
    return String((code ?? "").uppercased().filter { allowed.contains($0) })
}

/// The referral link, `https://sundeckpro.com/sign-up?code=BLUEWAVEPOOLS`, on the website the app
/// talks to (its trailing slash dropped). "" when there's no code or no website.
public func referralLink(_ webURL: String?, _ code: String?) -> String {
    var site = (webURL ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    while site.hasSuffix("/") { site.removeLast() }
    let clean = cleanReferralCode(code)
    return site.isEmpty || clean.isEmpty ? "" : "\(site)/sign-up?code=\(clean)"
}

/// The share sheet's message: the words, then the link.
public func referShareMessage(_ link: String) -> String {
    "Try Sundeck Pro for your pool business: \(link)"
}

/// Whether More shows the row: the shop's owners only (the people `referral_summary` answers), and
/// only once the server gave a code. No code, an error or offline: no row.
public func showsReferRow(_ role: String?, _ code: String?) -> Bool {
    role == "owner" && !cleanReferralCode(code).isEmpty
}
