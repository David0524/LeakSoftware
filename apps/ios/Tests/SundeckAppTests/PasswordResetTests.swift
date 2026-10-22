import Foundation
import Testing

@testable import SundeckApp

/// Forgot Password? (owner, 2026-10-22): signed out, the email goes to the website, which
/// answers the same whether or not the address has an account.
@Suite @MainActor struct PasswordResetTests {
    func api(_ host: String) -> WebAPI {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubServer.self]
        // Signed out: no token, and the request still goes.
        var api = WebAPI(baseURL: URL(string: "https://\(host)")!) { nil }
        api.session = URLSession(configuration: config)
        return api
    }

    @Test func sendsTheEmailSignedOutAndSaysWhatsNext() async {
        let host = "reset-\(UUID().uuidString.prefix(8).lowercased()).test"
        let message =
            "If dana@bluewave.test has a Sundeck Pro account, a reset link is on its way. It works for an hour."
        StubServer.set(host, "/api/auth/password-reset", 200, ["message": .string(message)])
        let form = PasswordResetForm()
        #expect(form.sendTitle == "Email Me a Reset Link")
        form.email = "not an email"
        await form.send(api(host))
        #expect(form.error == "Enter your email." && form.sent == nil)
        #expect(StubServer.calls(host).isEmpty)

        form.email = "  dana@bluewave.test "
        await form.send(api(host))
        #expect(form.error == nil && form.sent == message)
        #expect(StubServer.calls(host).last?.body == ["email": "dana@bluewave.test"])
    }

    @Test func showsTheServersMessageWhenEmailIsDown() async {
        let host = "reset-\(UUID().uuidString.prefix(8).lowercased()).test"
        StubServer.set(
            host, "/api/auth/password-reset", 503,
            ["error": "Email isn’t working right now. Email support@sundeckpro.com for help."])
        let form = PasswordResetForm(email: "dana@bluewave.test")
        await form.send(api(host))
        #expect(form.error == "Email isn’t working right now. Email support@sundeckpro.com for help.")
        #expect(form.sent == nil && form.email == "dana@bluewave.test")
    }
}
