import Foundation
import SundeckCore

/// Where Message on a stop goes (Today's card and rows; owner, 2026-10-21: "When the owner hits
/// the text button on a tech's Today page, it just sends you to Messages and not to the
/// customer's phone number"). Always the stop's customer:
/// - with the shop's company number working, their conversation (matched by customer, then by
///   number), else New Message to them;
/// - otherwise a text from the phone, addressed to the customer's number (`phone`): the system's
///   compose sheet, or Messages opened on that number.
public enum StopTextRoute: Equatable, Sendable {
    case conversation(String)
    case newMessage(customerId: String)
    /// The customer's number, as Messages takes it ("+16025550142").
    case phone(String)

    /// Nil when there's no number to text.
    public static func decide(
        lineActive: Bool, customerId: String?, phone: String?, conversations: [Conversation]
    ) -> StopTextRoute? {
        guard let phone, !phone.isEmpty else { return nil }
        let e164 = toE164(phone)
        if lineActive, let customerId {
            if let thread = conversations.first(where: { $0.customerId == customerId })
                ?? e164.flatMap({ number in conversations.first { $0.phone == number } })
            {
                return .conversation(thread.id)
            }
            return .newMessage(customerId: customerId)
        }
        return .phone(smsNumber(phone))
    }

    /// The number as Messages takes it: E.164 for a US number ("+16025550142", so Messages
    /// opens on that person whatever it showed last), else the digits as stored.
    public static func smsNumber(_ phone: String) -> String {
        toE164(phone) ?? phone.filter { $0.isNumber || $0 == "+" }
    }

    /// Messages opened on `phone`, with `body` filled in when there is one.
    public static func smsURL(_ phone: String, body: String?) -> URL? {
        let number = smsNumber(phone)
        guard !number.isEmpty else { return nil }
        guard let body, !body.isEmpty else { return URL(string: "sms:\(number)") }
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&+=?#")
        let encoded = body.addingPercentEncoding(withAllowedCharacters: allowed) ?? body
        return URL(string: "sms:\(number)&body=\(encoded)")
    }
}
