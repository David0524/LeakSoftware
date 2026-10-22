import Foundation
import SundeckCore
import Testing

@testable import SundeckApp

#if canImport(FoundationNetworking)
    import FoundationNetworking
#endif

/// Email Customers (owner, 2026-10-22): the page loads from /api/mass-email, counts each filter,
/// checks the fields, sends a test and the real thing with the confirmed count, and says plainly
/// when it's offline.
@Suite(.serialized) @MainActor struct MassEmailFormTests {
    func api(_ host: String) -> WebAPI {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubServer.self]
        var api = WebAPI(baseURL: URL(string: "https://\(host)")!) { "token" }
        api.session = URLSession(configuration: config)
        return api
    }

    let setupReply: JSONValue = [
        "shop": ["name": "Demo Leak Co.", "address": "200 W Washington St, Phoenix, AZ 85003"],
        "shows": [["value": "all", "label": "All Customers"], ["value": "plan", "label": "On a Plan"]],
        "cities": ["Mesa", "Phoenix"], "left": 300, "configured": true,
        "history": [
            [
                "id": "e1", "subject": "Fall opening", "status": "sent", "recipient_count": 42, "sent_count": 40,
                "failed_count": 2, "created_at": "2026-10-20T17:00:00Z",
            ]
        ],
    ]

    @Test func loadsCountsAndSends() async {
        let host = "mass-\(UUID().uuidString.prefix(8).lowercased()).test"
        StubServer.set(host, "/api/mass-email", 200, setupReply)
        StubServer.set(host, "/api/mass-email/count", 200, ["recipients": 42, "no_email": 3, "unsubscribed": 2])
        StubServer.set(host, "/api/mass-email/test", 200, ["message": "Test sent to owner@demo.test."])
        StubServer.set(
            host, "/api/mass-email/send", 200, ["message": "Sent to 42 customers.", "sent": 42, "failed": 0])
        let form = MassEmailForm()
        await form.load(api(host), companyId: "c1")
        #expect(
            form.setup?.cities == ["Mesa", "Phoenix"] && form.setup?.history.first?.detail == "Sent to 40 · 2 didn’t go"
        )

        form.city = "Mesa"
        form.days = 30
        await form.recount(api(host), companyId: "c1")
        #expect(form.countText?.count == "42 customers with an email.")
        #expect(form.countText?.skipped == "5 left out: 3 without an email, 2 unsubscribed.")
        #expect(
            StubServer.calls(host).last?.body == [
                "company_id": "c1", "audience": ["show": "all", "city": "Mesa", "days": 30],
            ])
        #expect(form.sendTitle == "Send to 42 Customers")

        // Empty fields stop it before the alert.
        #expect(!form.readyToSend())
        #expect(form.fieldErrors == ["subject": "Add a subject.", "body": "Write a message."])

        form.subject = "Fall opening"
        form.body = "Hi {first name},"
        await form.sendTest(api(host), companyId: "c1")
        #expect(form.message == "Test sent to owner@demo.test.")
        #expect(form.readyToSend())
        #expect(form.confirm.title == "Send to 42 customers?")
        await form.send(api(host), companyId: "c1")
        #expect(form.message == "Sent to 42 customers." && form.subject.isEmpty && form.body.isEmpty)
        let sent = StubServer.calls(host).first { $0.path == "/api/mass-email/send" }
        #expect(sent?.body["expected"] == 42 && sent?.body["subject"] == "Fall opening")
    }

    @Test func refusedAndOffline() async {
        let host = "mass-\(UUID().uuidString.prefix(8).lowercased()).test"
        var reply = setupReply
        if case .object(var o) = reply {
            o["shop"] = ["name": "Demo Leak Co.", "address": .null]
            o["left"] = 10
            reply = .object(o)
        }
        StubServer.set(host, "/api/mass-email", 200, reply)
        StubServer.set(host, "/api/mass-email/count", 200, ["recipients": 42, "no_email": 0, "unsubscribed": 0])
        let form = MassEmailForm()
        await form.load(api(host), companyId: "c1")
        await form.recount(api(host), companyId: "c1")
        // No address and over the day's allowance: Send stays off.
        #expect(form.blocked && form.overLimit && !form.canSend)

        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [NoConnection.self]
        var offline = WebAPI(baseURL: URL(string: "https://\(host)")!) { "token" }
        offline.session = URLSession(configuration: config)
        form.subject = "Hi"
        form.body = "Hello"
        await form.sendTest(offline, companyId: "c1")
        #expect(form.error == "Sending needs a connection. Try again when you have signal.")
        #expect(form.subject == "Hi" && form.body == "Hello")
    }
}
