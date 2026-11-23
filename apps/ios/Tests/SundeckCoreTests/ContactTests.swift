import Foundation
import SundeckCore
import Testing

/// contact.ts: Text and Call Customers, per person (owner, 2026-11-23).
@Suite struct ContactTests {
    let module = "contact"

    @Test func everyRuleIsChecked() {
        #expect(Fixtures.rules(module) == ["canContactCustomers", "teamRoleLine", "words"])
    }

    @Test func rules() {
        checkRule(module, "canContactCustomers") { c in
            canContactCustomers(try c.arg(0, as: String?.self), try c.arg(1, as: Bool?.self))
        }
        checkRule(module, "teamRoleLine") { c in
            teamRoleLine(try c.arg(0, as: String?.self), try c.arg(1, as: Bool?.self))
        }
    }

    @Test func words() {
        checkRule(module, "words") { _ in
            [
                "CONTACT_SWITCH_LABEL": contactSwitchLabel,
                "CONTACT_SWITCH_FOOTER": contactSwitchFooter,
                "NO_CONTACT_NOTE": noContactNote,
                "NO_CONTACT_MESSAGE": noContactMessage,
                "ON_FILE_NOTE": onFileNote,
                "ON_FILE_SENT": onFileSent,
            ]
        }
    }

    @Test func masksCustomersInHiddenShops() {
        let row: [String: JSONValue] = [
            "id": "c1", "company_id": "shop", "name": "Dana", "phone": "602", "email": "d@x.com",
            "cc_emails": ["e@x.com"], "notes": "Gate 1234",
        ]
        let masked = contactMasked("customer", row, hidden: ["shop"])
        #expect(masked["phone"] == .null)
        #expect(masked["email"] == .null)
        #expect(masked["cc_emails"] == .array([]))
        #expect(masked["notes"] == "Gate 1234")
        #expect(contactMasked("customer", row, hidden: ["other"]) == row)
        #expect(contactMasked("job", row, hidden: ["shop"]) == row)
    }
}
