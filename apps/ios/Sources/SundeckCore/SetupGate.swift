import Foundation

// A new shop's setup must be finished before its owner works in it (owner, 2026-10-24: "shops
// should have to submit a credit card for the trial"). The website sends that owner to the trial
// page; the app shows a plain screen instead, with no link to the website or the price (App Store
// rule 3.1.1). Port of setup-gate.ts; read its notes for the rule.

/// What public.company_access says about a shop's setup.
public struct SetupAccess: Codable, Equatable, Sendable {
    /// False until the owner adds the card or uses a demo code; nil from an older server.
    public var onboarded: Bool?
    public var plan: String?

    public init(onboarded: Bool?, plan: String?) {
        self.onboarded = onboarded
        self.plan = plan
    }
}

/// Whether this person must finish the shop's setup before using the app: only an owner (as on
/// the website), never a demo shop, never when the answer is unknown.
public func mustFinishSetup(_ access: SetupAccess?, role: String?) -> Bool {
    guard let access, role == "owner" else { return false }
    if access.plan == "demo" { return false }
    return access.onboarded == false
}

/// The screen for an owner whose shop isn't set up yet (`FINISH_SETUP_TITLE`, `FINISH_SETUP_BODY`).
public let finishSetupTitle = "Finish Setting Up Your Account"
public let finishSetupBody =
    "Your shop’s setup isn’t finished yet. Sign in on a computer to finish it, then come back here."
/// After Check Again, when setup still isn't finished (`FINISH_SETUP_STILL`).
public let finishSetupStill = "Setup isn’t finished yet. Check again once it’s done."
/// After Check Again without a connection (`FINISH_SETUP_OFFLINE`).
public let finishSetupOffline = "No connection. Try again when you’re online."
/// After Check Again, when the server couldn't answer (`FINISH_SETUP_FAILED`).
public let finishSetupFailed = "Couldn’t check right now. Try again in a minute."
