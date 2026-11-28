import Foundation
import SundeckCore
import Testing

/// ok-to-text.ts: a customer's OK to Text (owner, 2026-11-28).
@Suite struct OkToTextTests {
    @Test func value() {
        let la = OkToText.value("2026-11-28T06:30:00Z", repliedStop: false, timeZone: "America/Los_Angeles")
        #expect(la == "Yes · Nov 27, 2026")
        let pg = OkToText.value("2026-11-28 06:30:00.123+00", repliedStop: false, timeZone: "America/Phoenix")
        #expect(pg == "Yes · Nov 27, 2026")
        #expect(OkToText.value(nil, repliedStop: false, timeZone: "America/Phoenix") == "Not yet")
        let stop = OkToText.value("2026-11-28T06:30:00Z", repliedStop: true, timeZone: "America/Phoenix")
        #expect(stop == "Replied STOP")
    }

    @Test func reminder() {
        #expect(OkToText.needsMark(textOkAt: nil, isCustomer: true, repliedStop: false))
        #expect(!OkToText.needsMark(textOkAt: "2026-11-28T06:30:00Z", isCustomer: true, repliedStop: false))
        #expect(!OkToText.needsMark(textOkAt: nil, isCustomer: true, repliedStop: true))
        #expect(!OkToText.needsMark(textOkAt: nil, isCustomer: false, repliedStop: false))
    }
}
