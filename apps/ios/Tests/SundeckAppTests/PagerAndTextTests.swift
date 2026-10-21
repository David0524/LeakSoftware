import Foundation
import Testing

@testable import SundeckApp

/// Schedule's pages follow the finger (owner, 2026-10-21: "Should be able to drag it as fast or
/// slow as you want, hold halfway, etc."), and Message on a stop always goes to that stop's
/// customer (owner, 2026-10-21: "it just sends you to Messages and not to the customer's phone
/// number").
@Suite struct PagerAndTextTests {
    @Test func aDragDecidesItsDirectionAfterTenPoints() {
        #expect(PagerRule.lock(CGSize(width: 9, height: 3)) == nil)
        #expect(PagerRule.lock(CGSize(width: -10, height: 4)) == .horizontal)
        #expect(PagerRule.lock(CGSize(width: 6, height: 12)) == .vertical)
        // Exactly diagonal is a scroll: the page's own scrolling wins a tie.
        #expect(PagerRule.lock(CGSize(width: 12, height: 12)) == .vertical)
    }

    @Test func thePageFollowsTheFingerAndGivesWhereThereIsNoPage() {
        #expect(PagerRule.follow(-120, width: 400, canPrevious: true, canNext: true) == -120)
        #expect(PagerRule.follow(80, width: 400, canPrevious: true, canNext: false) == 80)
        let band = PagerRule.follow(-120, width: 400, canPrevious: true, canNext: false)
        #expect(band < 0 && band > -120)
        // Farther gives less and less, and never reaches the width.
        let far = PagerRule.rubberBand(-4000, width: 400)
        #expect(far > -400 && far < band)
        #expect(PagerRule.rubberBand(50, width: 0) == 0)
    }

    @Test func aSlowDragTurnsPastAQuarterAndAFlickTurnsEarly() {
        func turn(_ dx: CGFloat, _ v: CGFloat = 0, prev: Bool = true, next: Bool = true) -> Int {
            PagerRule.outcome(dx, velocity: v, width: 400, canPrevious: prev, canNext: next)
        }
        // Held halfway and let go slowly: it turns; brought back under a quarter: it doesn't.
        #expect(turn(-200) == 1)
        #expect(turn(150) == -1)
        #expect(turn(-100) == 0)
        #expect(turn(-101) == 1)
        // A quick flick turns from a short drag, but only the way the finger went.
        #expect(turn(-30, -800) == 1)
        #expect(turn(30, 800) == -1)
        #expect(turn(-30, 800) == 0)
        #expect(turn(-20, -900) == 0)
        #expect(turn(-30, -400) == 0)
        // Nothing that way: it springs back.
        #expect(turn(-300, prev: true, next: false) == 0)
        #expect(turn(300, prev: false) == 0)
    }

    @Test func theSettleCarriesOnAtTheFingersSpeed() {
        #expect(PagerRule.springVelocity(-1000, from: -100, to: -400) > 3)
        // Never backwards, and nothing when it's already there.
        #expect(PagerRule.springVelocity(500, from: -100, to: -400) == 0)
        #expect(PagerRule.springVelocity(-500, from: -400, to: -400) == 0)
    }

    private func thread(_ id: String, phone: String, customer: String?) throws -> Conversation {
        var row: [String: String] = ["id": id, "phone": phone]
        row["customer_id"] = customer
        return try JSONDecoder().decode(Conversation.self, from: JSONEncoder().encode(row))
    }

    @Test func messageOpensTheCustomersConversationOrNewMessageToThem() throws {
        let list = [
            try thread("t1", phone: "+16025550111", customer: "c1"),
            try thread("t2", phone: "+16025550142", customer: nil),
        ]
        // Their conversation, by customer, then by number.
        #expect(
            StopTextRoute.decide(lineActive: true, customerId: "c1", phone: "(602) 555-0199", conversations: list)
                == .conversation("t1"))
        #expect(
            StopTextRoute.decide(lineActive: true, customerId: "c2", phone: "(602) 555-0142", conversations: list)
                == .conversation("t2"))
        // No conversation yet: New Message to that customer, never the inbox.
        #expect(
            StopTextRoute.decide(lineActive: true, customerId: "c3", phone: "(602) 555-0100", conversations: list)
                == .newMessage(customerId: "c3"))
    }

    @Test func withoutTheCompanyNumberItTextsTheCustomersNumberFromThePhone() {
        #expect(
            StopTextRoute.decide(lineActive: false, customerId: "c1", phone: "(602) 555-0100", conversations: [])
                == .phone("+16025550100"))
        #expect(
            StopTextRoute.decide(lineActive: true, customerId: nil, phone: "602-555-0100", conversations: [])
                == .phone("+16025550100"))
        #expect(StopTextRoute.decide(lineActive: true, customerId: "c1", phone: nil, conversations: []) == nil)
        #expect(StopTextRoute.smsURL("(602) 555-0100", body: nil)?.absoluteString == "sms:+16025550100")
        #expect(
            StopTextRoute.smsURL("(602) 555-0100", body: "Hi & bye")?.absoluteString
                == "sms:+16025550100&body=Hi%20%26%20bye")
        // Not a US number: the digits as stored.
        #expect(StopTextRoute.smsNumber("12") == "12")
    }
}
