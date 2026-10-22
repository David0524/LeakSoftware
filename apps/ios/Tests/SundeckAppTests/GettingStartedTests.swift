import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

@Suite @MainActor struct GettingStartedTests {
    @Test func progressComesFromTheShopsRows() throws {
        let s = try Shell()
        func row(_ table: String, _ data: Row) -> PulledRow { PulledRow(table: table, xid: "1", row: data) }
        try s.sync.store.applyPage(
            PullPage(
                rows: [
                    row("company", ["id": "c1", "company_id": "c1", "name": "Demo", "logo_path": "c1/logo.png"]),
                    row("membership", ["id": "m1", "company_id": "c1", "status": "active"]),
                    row("membership", ["id": "m2", "company_id": "c1", "status": "removed"]),
                    row("customer", ["id": "cu1", "company_id": "c1", "name": "Sam"]),
                    row(
                        "customer",
                        ["id": "cu2", "company_id": "c1", "name": "Old", "deleted_at": "2026-10-01T00:00:00Z"]),
                    row("job", ["id": "j1", "company_id": "c1", "type": "detection"]),
                    row("job", ["id": "j2", "company_id": "c1", "type": "repair"]),
                    row("report", ["id": "r1", "company_id": "c1", "sent_at": .null]),
                    row("invoice", ["id": "i1", "company_id": "c1", "sent_at": "2026-10-02T00:00:00Z"]),
                ], done: true, cursor: [:], serverHLC: "1760000000001-0000-srv"))
        let company = CompanyContext(id: "c1", name: "Demo", timeZone: "America/Phoenix", settings: [:], role: "owner")
        let p = shopProgress(s.sync.store, company: company, invites: 0, payments: false)
        #expect(
            p
                == ShopProgress(
                    people: 1, hasLogo: true, customers: 1, leakJobs: 1, reportsSent: 0, invoicesSent: 1))
        let steps = gettingStarted(.leak, p)
        #expect(steps.map(\.id) == ["invite", "logo", "payments", "job", "report"])
        #expect(steps.filter(\.done).map(\.id) == ["logo", "job"])
    }

    @Test func hidingItIsRemembered() throws {
        let s = try Shell()
        let w = Walkthrough(s.sync.kv)
        #expect(!w.gettingStartedHidden)
        w.setGettingStartedHidden(true)
        #expect(Walkthrough(s.sync.kv).gettingStartedHidden)
    }
}
