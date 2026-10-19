import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

@Suite @MainActor struct MessagingDataTests {
    @Test func conversationsAreNewestFirstAndNamedForTheCustomer() throws {
        let s = try Shell()
        try s.sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "customer", xid: "1", row: ["id": "cu1", "company_id": "c1", "name": "Sam Sample"]),
                    PulledRow(
                        table: "conversation", xid: "1",
                        row: [
                            "id": "cv1", "company_id": "c1", "phone": "+16025550199", "customer_id": "cu1",
                            "last_at": "2026-10-11T10:00:00Z", "last_preview": "Thanks", "unread": true,
                            "opted_out": false,
                        ]),
                    PulledRow(
                        table: "conversation", xid: "1",
                        row: [
                            "id": "cv2", "company_id": "c1", "phone": "+16025550123", "last_at": "2026-10-12T10:00:00Z",
                            "unread": false, "opted_out": false,
                        ]),
                    PulledRow(
                        table: "text_message", xid: "1",
                        row: [
                            "id": "t2", "company_id": "c1", "conversation_id": "cv1",
                            "created_at": "2026-10-11T10:00:00Z",
                            "direction": "in", "body": "Thanks", "media": [], "status": "received",
                        ]),
                    PulledRow(
                        table: "call_log", xid: "1",
                        row: [
                            "id": "k1", "company_id": "c1", "conversation_id": "cv1",
                            "created_at": "2026-10-11T09:00:00Z",
                            "direction": "out", "status": "completed", "duration_seconds": 42,
                        ]),
                    PulledRow(
                        table: "phone_line", xid: "1",
                        row: ["id": "pl1", "company_id": "c1", "number": "+16025550100", "status": "active"]),
                ], done: true, cursor: [:], serverHLC: "1760000000001-0000-srv"))
        let list = conversations(s.sync.store, companyId: "c1")
        #expect(list.map(\.id) == ["cv2", "cv1"])
        #expect(list.map(\.name) == [formatPhone("+16025550123"), "Sam Sample"])
        #expect(thread(s.sync.store, companyId: "c1", conversationId: "cv1").map(\.id) == ["k1", "t2"])
        #expect(companyLine(s.sync.store, companyId: "c1")?.number == "+16025550100")

        try MessagingWrites.markRead(s.sync, companyId: "c1", list[1])
        #expect(try s.sync.store.get("conversation", "cv1")?["unread"] == false)
    }
}
