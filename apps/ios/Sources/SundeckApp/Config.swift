import Foundation

/// Public connection settings: the dev project from `config/supabase-dev.json` (a test keeps
/// them equal). Only public values belong here; RLS protects the data.
public enum AppConfig {
    public static let supabaseURL = URL(string: "https://evmxdfasurkaxbwkceti.supabase.co")!
    public static let supabasePublishableKey = "sb_publishable_O6weK1GnSFl-ogG6amRPlA_5rjPPitD"
    /// Website for server features (reports, quotes, invoices, transcription).
    public static let webURL = URL(string: "https://sundeckpro.com")!

    /// Sentry is on only when the build sets `SentryDSN` in Info.plist (BUILD_PLAN section 11).
    public static var sentryDSN: String? {
        guard let dsn = Bundle.main.object(forInfoDictionaryKey: "SentryDSN") as? String,
            !dsn.isEmpty
        else { return nil }
        return dsn
    }
}
