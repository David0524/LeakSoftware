import Foundation
import SundeckCore
import SundeckSync

// The Messages screens' words and order (spec 5.7; website components/inbox.tsx and
// app/(office)/messages), kept out of SwiftUI so they test on Linux.

/// Dates in a shop's time zone, with US wording ("9:41 AM", "Oct 11", "Sunday, Oct 11").
struct ShopClock {
    var timeZone: TimeZone

    init(_ identifier: String) {
        timeZone = TimeZone(identifier: identifier) ?? TimeZone(identifier: "America/Phoenix") ?? .current
    }

    func format(_ date: Date, _ pattern: String) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = timeZone
        f.dateFormat = pattern
        return f.string(from: date)
    }

    /// The shop's calendar day of an instant ("2026-10-11").
    func day(_ date: Date) -> String { format(date, "yyyy-MM-dd") }

    func time(_ date: Date) -> String { format(date, "h:mm a") }
}

/// The time beside a conversation in the list: "9:41 AM" today, "Yesterday", else "Oct 11".
public func inboxTime(_ iso: String, now: Date = Date(), timeZone: String) -> String {
    guard let at = parseISODate(iso) else { return "" }
    let clock = ShopClock(timeZone)
    if clock.day(at) == clock.day(now) { return clock.time(at) }
    if clock.day(at) == clock.day(now.addingTimeInterval(-86_400)) { return "Yesterday" }
    return clock.format(at, "MMM d")
}

/// What a text's status reads as under it.
public func textStatusLabel(_ status: String) -> String {
    switch status {
    case "queued": "Sending"
    case "sent": "Sent"
    case "delivered": "Delivered"
    case "undelivered": "Not delivered"
    case "failed": "Not sent"
    default: status
    }
}

/// A text that didn't reach the customer: its line is in `fail`.
public func textFailed(_ text: TextMessage) -> Bool { text.status == "failed" || text.status == "undelivered" }

private func minutesText(_ seconds: Int?) -> String {
    guard let seconds else { return "" }
    return seconds < 60 ? "\(seconds) sec" : "\(Int((Double(seconds) / 60).rounded())) min"
}

/// Whether a call left a voicemail.
public func isVoicemail(_ call: CallLog) -> Bool { call.recordingSid != nil || call.status == "voicemail" }

/// A call in the thread: "Missed call", "Voicemail · 1 min", "Tony Tech called · 3 min".
public func callLabel(_ call: CallLog, names: [String: String]) -> String {
    if isVoicemail(call) { return "Voicemail · \(minutesText(call.durationSeconds))" }
    switch call.status {
    case "missed": return "Missed call"
    case "failed": return call.direction == "out" ? "Call didn’t connect" : "Missed call"
    case "ringing": return call.direction == "out" ? "Calling…" : "Incoming call"
    default:
        let who = call.userId.flatMap { names[$0] }
        let verb = call.direction == "out" ? "\(who ?? "Team") called" : "Incoming call"
        let length = (call.durationSeconds ?? 0) > 0 ? " · \(minutesText(call.durationSeconds))" : ""
        return verb + length
    }
}

/// The small line under a text: ours "{Sender} · {Delivered} · {9:41 AM}" (and the reason when
/// it failed), theirs the time.
public func textFooter(_ text: TextMessage, names: [String: String], timeZone: String) -> String {
    let time = parseISODate(text.createdAt).map { ShopClock(timeZone).time($0) } ?? ""
    guard text.direction == "out" else { return time }
    let line = [text.sentBy.flatMap { names[$0] }, textStatusLabel(text.status), time]
        .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    return text.error.map { "\(line) (\($0))" } ?? line
}

/// A thread item, with the day above it when it's the day's first ("Sunday, Oct 11").
public struct ThreadRow: Identifiable, Equatable, Sendable {
    public var item: ThreadItem
    public var day: String?
    public var time: String

    public var id: String { item.id }
}

public func threadRows(_ items: [ThreadItem], timeZone: String) -> [ThreadRow] {
    let clock = ShopClock(timeZone)
    var last: String?
    return items.map { item in
        let at = parseISODate(item.createdAt)
        let day = at.map { clock.format($0, "EEEE, MMM d") } ?? ""
        defer { last = day }
        return ThreadRow(item: item, day: day != last ? day : nil, time: at.map(clock.time) ?? "")
    }
}

/// Teammates' names by user id (sent-by lines, calls).
public func teamNames(_ kv: KeyValue) -> [String: String] {
    Dictionary(kv.team.map { ($0.id, $0.displayName) }, uniquingKeysWith: { a, _ in a })
}

/// What Messages says when the company number isn't working (nil when it is).
public struct LineNotice: Equatable, Sendable {
    public var text: String
    /// "Set Up a Number" for managers.
    public var link: String?
}

public func lineNotice(_ line: PhoneLine?, manager: Bool) -> LineNotice? {
    if line?.status == "active" { return nil }
    if let line, line.status == "pending" {
        return LineNotice(
            text:
                "\(formatPhone(line.number)) is being set up for texting. It usually takes a few days; texts and calls will appear here once it’s ready."
        )
    }
    let intro = "Text and call customers from one company number the whole team shares."
    return manager
        ? LineNotice(text: intro, link: "Set Up a Number")
        : LineNotice(text: "\(intro) Ask an owner to set up a company number.")
}

/// The conversation already open with this number, if any (New Message opens it instead).
public func existingConversation(_ list: [Conversation], phone: String?) -> Conversation? {
    guard let e164 = toE164(phone) else { return nil }
    return list.first { $0.phone == e164 }
}

/// Where a photo for a text goes in the `texts` bucket: `{company}/out/{uuid}.{ext}`, as the
/// Expo app's uploadTextPicture.
public func textPicturePath(companyId: String, id: String = uuidv7(), type: String) -> String {
    let ext = type.split(separator: "/").dropFirst().first.map(String.init) ?? "jpeg"
    return "\(companyId)/out/\(id).\(ext)"
}

/// "1 photo attached", "2 photos attached".
public func photosAttached(_ count: Int) -> String { count == 1 ? "1 photo attached" : "\(count) photos attached" }

/// A customer to text from New Message.
public struct MessageRecipient: Identifiable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var phone: String
}

/// Customers with a phone number, by name, filtered by name or number.
public func messageRecipients(_ store: LocalStore, companyId: String, search: String = "") -> [MessageRecipient] {
    let term = search.trimmingCharacters(in: .whitespaces).lowercased()
    let digits = term.filter(\.isNumber)
    return ((try? store.list("customer", companyId: companyId)) ?? [])
        .compactMap { row -> MessageRecipient? in
            guard let phone = row["phone"]?.string, toE164(phone) != nil else { return nil }
            return MessageRecipient(id: row.id, name: row["name"]?.string ?? "Customer", phone: phone)
        }
        .filter {
            term.isEmpty || $0.name.lowercased().contains(term)
                || (!digits.isEmpty && $0.phone.filter(\.isNumber).contains(digits))
        }
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
}

/// What the Call button says once the call is placed (the website's words).
public func callResultText(calling: String, demo: Bool) -> String {
    demo ? "Demo: no call placed (Twilio isn’t connected)." : "Calling you at \(calling). Answer to connect."
}
