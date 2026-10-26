import Foundation
import Observation
import SundeckCore

/// Forgot Password? (owner, 2026-10-22): the account's email, posted signed out to
/// POST /api/auth/password-reset, which emails a link to choose a new password on the website.
/// Port of the website's ForgotPasswordForm (apps/web/src/components/auth-forms.tsx), with its words.
@MainActor @Observable
public final class PasswordResetForm {
    public static let title = "Reset Password"
    public static let intro = "Enter your account’s email. We’ll send a link to choose a new password."
    public static let empty = "Enter your email."
    public static let back = "Back to Sign In"

    public var email = ""
    public private(set) var sending = false
    /// The server's or the connection's message; the email stays so it can be sent again.
    public private(set) var error: String?
    /// Sent: "If … has a Sundeck Pro account, a reset link is on its way."
    public private(set) var sent: String?

    public init(email: String = "") { self.email = email }

    /// "Email Me a Reset Link", or "Sending…" while it goes.
    public var sendTitle: String { sending ? "Sending…" : "Email Me a Reset Link" }

    /// The address to send, trimmed, or nil when it isn't one (the website's EMAIL_PATTERN).
    public static func address(_ text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.wholeMatch(of: /\S+@\S+\.\S+/) != nil ? trimmed : nil
    }

    public func send(_ api: WebAPI) async {
        guard !sending else { return }
        error = nil
        sent = nil
        guard let address = Self.address(email) else {
            error = Self.empty
            return
        }
        sending = true
        defer { sending = false }
        do {
            let reply = try await api.postSignedOut("api/auth/password-reset", ["email": .string(address)])
            sent = reply["message"]?.string ?? "If \(address) has a Sundeck Pro account, a reset link is on its way."
        } catch {
            self.error = userMessage(error)
        }
    }
}
