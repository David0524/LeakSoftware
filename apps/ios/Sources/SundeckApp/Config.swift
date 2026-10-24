import Foundation

/// Public connection settings. A build points at a Supabase project through Info.plist
/// (`SundeckSupabaseURL`, `SundeckSupabaseKey`, `SundeckWebURL`, filled from the build settings
/// `SUNDECK_SUPABASE_URL`, `SUNDECK_SUPABASE_KEY` and `SUNDECK_WEB_URL`; the TestFlight workflow
/// sets them from `config/supabase-prod.json` for a production build). Unset, it uses the dev
/// project from `config/supabase-dev.json` (a test keeps them equal). Only public values belong
/// here; RLS protects the data.
public enum AppConfig {
    static let devSupabaseURL = URL(string: "https://evmxdfasurkaxbwkceti.supabase.co")!
    static let devSupabasePublishableKey = "sb_publishable_O6weK1GnSFl-ogG6amRPlA_5rjPPitD"
    static let defaultWebURL = URL(string: "https://sundeckpro.com")!

    public static let supabaseURL =
        AppConfig.url(Bundle.main.infoDictionary, "SundeckSupabaseURL") ?? devSupabaseURL
    public static let supabasePublishableKey =
        AppConfig.setting(Bundle.main.infoDictionary, "SundeckSupabaseKey")
        ?? devSupabasePublishableKey
    /// Website for server features (reports, quotes, invoices, transcription).
    public static let webURL =
        AppConfig.url(Bundle.main.infoDictionary, "SundeckWebURL") ?? defaultWebURL

    /// Sentry is on only when the build sets `SentryDSN` in Info.plist (BUILD_PLAN section 11).
    public static var sentryDSN: String? {
        guard let dsn = Bundle.main.object(forInfoDictionaryKey: "SentryDSN") as? String,
            !dsn.isEmpty
        else { return nil }
        return dsn
    }

    /// An Info.plist value the build set: not empty, and not a `$(SETTING)` left unexpanded (a
    /// build that doesn't fill in build settings).
    static func setting(_ info: [String: Any]?, _ key: String) -> String? {
        guard let value = (info?[key] as? String)?.trimmingCharacters(in: .whitespaces),
            !value.isEmpty, !value.contains("$(")
        else { return nil }
        return value
    }

    /// An https address the build set, without a trailing slash.
    static func url(_ info: [String: Any]?, _ key: String) -> URL? {
        guard var value = setting(info, key), value.hasPrefix("https://") else { return nil }
        while value.hasSuffix("/") { value.removeLast() }
        return URL(string: value)
    }
}
