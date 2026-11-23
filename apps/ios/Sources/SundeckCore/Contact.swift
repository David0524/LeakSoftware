/// Text and Call Customers, per person (owner, 2026-11-23: "some of the less trustworthy techs
/// shouldn't have access to messaging and calling customers, but some should"; "The contact
/// permission would be fully off"). Port of packages/core contact.ts.
///
/// A switch on a tech's profile in Settings › Team (`membership.can_contact_customers`, default
/// on). Owners and admins always have it. Off, a tech has no Messages, no call, text or email
/// buttons for customers, and doesn't see customers' phone numbers or emails (the server sends
/// them blank; the phone hides them until it does). Reports, visit reports, invoices and
/// receipts still go to what's on file.

/// The switch on a tech's profile.
public let contactSwitchLabel = "Text and Call Customers"

/// Under the switch.
public let contactSwitchFooter =
    "When it’s off, they don’t see Messages or customers’ phone numbers and emails, can’t call, text, or email customers, and calls to the company number don’t ring them. Reports and invoices still go to the customer."

/// After the role on the Team list, for a tech without it: "Tech · No customer contact".
public let noContactNote = "No customer contact"

/// What a tech without it sees in place of Messages, and what the server says.
public let noContactMessage = "Texting and calling customers is turned off for you. Ask an owner or admin."

/// Where a report, visit report, invoice, or receipt goes for someone without it.
public let onFileNote = "Goes to the customer’s email on file."

/// After such a send.
public let onFileSent = "Sent to the customer’s email on file."

/// Whether this person may text, call, and email customers, and see Messages.
public func canContactCustomers(_ role: String?, _ allowed: Bool?) -> Bool {
    isManagerRole(role) || allowed != false
}

/// The line under a name on the Team list: "Tech", or "Tech · No customer contact".
public func teamRoleLine(_ role: String?, _ allowed: Bool?) -> String {
    canContactCustomers(role, allowed) ? roleLabel(role) : "\(roleLabel(role)) · \(noContactNote)"
}

/// The tables with customers' contact details, and the blanks shown in their place.
public let contactBlanks: [String: [String: JSONValue]] = [
    "customer": ["phone": .null, "email": .null, "cc_emails": .array([])],
    "message": ["recipient": .string("")],
]

/// A synced row as someone without Text and Call Customers in `hidden` shops may see it.
public func contactMasked(_ table: String, _ row: [String: JSONValue], hidden: Set<String>)
    -> [String: JSONValue]
{
    guard let blanks = contactBlanks[table], let company = row["company_id"]?.string, hidden.contains(company)
    else { return row }
    return row.merging(blanks) { _, blank in blank }
}
