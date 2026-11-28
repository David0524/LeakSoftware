import Foundation

// Texting registration (owner, 2026-11-27; docs/plans/texting-registration.md): before a shop's
// number can text, phone companies need its business on file. Three ways to get a number; the
// shop enters its business once and Sundeck Pro submits it. The words match core's
// texting-registration.ts (the website and Android); the server checks the details and words
// the status itself.

public enum RegistrationKind: String, CaseIterable, Sendable, Identifiable {
    case tollFree = "toll_free"
    case local
    case own

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .tollFree: "Get a Toll-Free Number"
        case .local: "Get a Local Number"
        case .own: "Use My Own Number"
        }
    }

    public var detail: String {
        switch self {
        case .tollFree: "An 800-style number for texts and calls. Usually ready in about a week."
        case .local: "A number with your area code. Usually ready in one to three weeks."
        case .own:
            "Text from the number your customers already know. Calls stay with your phone company. Usually ready in one to three weeks."
        }
    }
}

public struct BusinessTypeOption: Sendable {
    public let value: String
    public let label: String
}

/// The business types phone companies accept with an EIN, in core's order.
public let businessTypes: [BusinessTypeOption] = [
    .init(value: "llc", label: "LLC"),
    .init(value: "corporation", label: "Corporation"),
    .init(value: "partnership", label: "Partnership"),
    .init(value: "sole_proprietor", label: "Sole Proprietor"),
    .init(value: "nonprofit", label: "Nonprofit"),
]

public enum BusinessKeyboard: Sendable {
    case text, number, email, phone, url
}

public struct BusinessFieldSpec: Sendable, Identifiable {
    public let key: String
    public let label: String
    public let placeholder: String
    public let keyboard: BusinessKeyboard
    public var id: String { key }
}

/// The form's fields (core BUSINESS_FIELDS), the business type aside.
public let businessFields: [BusinessFieldSpec] = [
    .init(key: "legal_name", label: "Legal name", placeholder: "Blue Wave Pools LLC", keyboard: .text),
    .init(key: "ein", label: "EIN", placeholder: "12-3456789", keyboard: .number),
    .init(key: "street", label: "Street", placeholder: "123 Main St", keyboard: .text),
    .init(key: "city", label: "City", placeholder: "Las Vegas", keyboard: .text),
    .init(key: "state", label: "State", placeholder: "NV", keyboard: .text),
    .init(key: "postal_code", label: "ZIP code", placeholder: "89101", keyboard: .number),
    .init(key: "website", label: "Website", placeholder: "bluewavepools.com", keyboard: .url),
    .init(key: "first_name", label: "First name", placeholder: "Alex", keyboard: .text),
    .init(key: "last_name", label: "Last name", placeholder: "Rivera", keyboard: .text),
    .init(key: "title", label: "Job title", placeholder: "Owner", keyboard: .text),
    .init(key: "email", label: "Email", placeholder: "alex@bluewavepools.com", keyboard: .email),
    .init(key: "phone", label: "Mobile", placeholder: "(702) 555-0100", keyboard: .phone),
]

public struct BusinessSection: Sendable {
    public let title: String
    public let keys: [String]
    /// What phone companies check in this group (core BUSINESS_GROUP_FOOTER).
    public let footer: String
}

/// The two groups the form shows them in (core BUSINESS_SECTIONS).
public let businessSections: [BusinessSection] = [
    .init(
        title: "Business",
        keys: ["legal_name", "business_type", "ein", "street", "city", "state", "postal_code", "website"],
        footer:
            "Use your legal name and address exactly as on your IRS EIN letter. No website? Use a Facebook, Instagram, or Yelp page that’s been active for a few weeks. Phone companies check that it shows your business name, services, and how to reach you."
    ),
    .init(
        title: "Contact person", keys: ["first_name", "last_name", "title", "email", "phone"],
        footer:
            "Use a cell phone that gets texts, not a landline. Phone companies may text it to confirm. Reply YES within 24 hours."
    ),
]

public let businessFooter =
    "Phone companies require this before your shop can text customers. We submit it for you."

public enum RegistrationText {
    public static let getNumber = "Get a number"
    public static let getNumberFooter =
        "Texting needs a company number. Phone companies review each business before its number can text, so it takes a few days to a few weeks. We do the paperwork."
    public static let chooseNumber = "Choose a number"
    public static let yourNumber = "Your number"
    public static let yourNumberHint = "The number your customers call today."
    public static let register = "Register Number"
    public static let edit = "Edit Business Details"
    public static let sendAgain = "Send Again"
    public static let type = "Type"

    /// The EIN field's placeholder while editing: the saved one stays when it's left empty.
    public static func savedEIN(_ last4: String) -> String { "Ends in \(last4)" }
}
