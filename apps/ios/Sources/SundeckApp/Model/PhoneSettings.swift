import Foundation
import Observation
import SundeckCore

// Settings › Phone and Texting in the app (owner, 2026-10-20: "From the app, do not link to the
// website"; the owner added their own mobile number and still couldn't text). Texting needs a
// company number; a person's own mobile number is only where their calls ring. Through
// GET and POST /api/phone, the website's page's rules (server/phone-line.ts).

public enum PhoneText {
    public static let title = "Phone and Texting"
    public static let subtitle = "Text and call customers from one company number the whole team shares."
    public static let needsNumber =
        "Texting needs a company number: a local number that texts, sends photos, and takes calls. Included with Sundeck Pro. Your own mobile number, below, is only where calls ring."
    public static let newNumber = "Get a New Number"
    public static let areaCode = "Area code"
    public static let search = "Search"
    public static let searching = "Searching…"
    public static let useThis = "Use This Number"
    public static let keepTitle = "Use Your Shop’s Number"
    public static let keepHint = "Sundeck Pro registers it for texting. It takes a few days."
    public static let keepButton = "Set Up My Number"
    public static let companyNumber = "Company number"
    public static let active = "Working. Texts and calls show up in Messages."
    public static let pending = "Your own number is being set up for texting. It usually takes a few days."
    public static let cancel = "Cancel Setup"
    public static let cancelConfirm = "Stop setting up this number?"
    public static let textsAndCalls = "Texts and calls"
    public static let pictures = "Photos in texts"
    public static let picturesHint = "Send and receive pictures (MMS)."
    public static let greeting = "Voicemail greeting"
    public static let callsRing = "Calls ring"
    public static let callsRingHint =
        "In working hours (Scheduling and Routes) these phones ring at once and the first to answer gets the call. After hours, or when nobody answers, callers leave a voicemail."
    public static let saveLine = "Save"
    public static let onMyWay = "On My Way"
    public static let myMobile = "Your mobile number"
    public static let myMobileHint =
        "Calls you place ring here first, then connect from the company number. Customers never see it, and texts don’t come from it. Each person adds their own on the phone app or here."
    public static let saveMobile = "Save Number"
    public static let notManager = "Only owners and admins can change the company number."

    public static func greetingPlaceholder(_ shop: String) -> String {
        "Thanks for calling \(shop). We can’t take your call right now. Leave a message and we’ll call you back."
    }

    public static func ringLabel(_ m: PhoneTeamMember) -> String {
        "\(m.name) · \(m.phone.map(formatPhone) ?? "no mobile number yet")"
    }
}

public struct PhoneLineView: Equatable, Sendable {
    public var number: String
    /// "pending" or "active".
    public var status: String
    public var pictures: Bool
    public var ringUserIds: [String]
    public var voicemailGreeting: String?
}

public struct PhoneTeamMember: Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var role: String
    public var phone: String?
    public var rings: Bool
}

public struct FoundNumber: Equatable, Sendable, Identifiable {
    public var number: String
    public var locality: String?
    public var region: String?
    public var id: String { number }
    public var place: String? {
        let p = [locality, region].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
        return p.isEmpty ? nil : p
    }
}

@MainActor @Observable
public final class PhoneSettingsModel {
    public private(set) var loaded = false
    public private(set) var configured = true
    public private(set) var line: PhoneLineView?
    public private(set) var team: [PhoneTeamMember] = []
    public private(set) var numbers: [FoundNumber] = []
    public private(set) var busy: String?
    /// What the last action said, and whether it failed.
    public private(set) var result: (text: String, error: Bool)?
    public private(set) var fieldErrors: [String: String] = [:]

    // The forms.
    public var areaCode = ""
    public var keepNumber = ""
    public var pictures = true
    public var greeting = ""
    public var rings: Set<String> = []
    public var myPhone = ""

    /// The line settings and my mobile number as the server last sent them.
    private var saved = Saved()

    private struct Saved: Equatable {
        var pictures = true
        var greeting = ""
        var rings: Set<String> = []
        var myPhone = ""
    }

    /// Changed here and not saved yet: leaving the page asks first (owner, 2026-10-20).
    public var isDirty: Bool {
        loaded
            && (pictures != saved.pictures || textChanged(greeting, from: saved.greeting) || rings != saved.rings
                || textChanged(myPhone, from: saved.myPhone))
    }

    private let api: WebAPI
    private let companyId: String

    public init(api: WebAPI, companyId: String) {
        self.api = api
        self.companyId = companyId
    }

    public func load() async {
        do {
            apply(try await api.get("api/phone", query: ["company_id": companyId]))
            loaded = true
        } catch {
            result = (String(describing: error), true)
        }
    }

    func apply(_ reply: JSONValue) {
        configured = reply["configured"]?.bool ?? true
        if let l = reply["line"], case .object = l, let number = l["number"]?.string {
            let ids: [String] = {
                guard case .array(let a)? = l["ring_user_ids"] else { return [] }
                return a.compactMap(\.string)
            }()
            line = PhoneLineView(
                number: number, status: l["status"]?.string ?? "pending", pictures: l["pictures"]?.bool ?? false,
                ringUserIds: ids, voicemailGreeting: l["voicemail_greeting"]?.string)
        } else {
            line = nil
        }
        if case .array(let list)? = reply["team"] {
            team = list.compactMap { m in
                guard let id = m["user_id"]?.string else { return nil }
                return PhoneTeamMember(
                    id: id, name: m["name"]?.string ?? "Teammate", role: m["role"]?.string ?? "tech",
                    phone: m["phone"]?.string, rings: m["rings"]?.bool ?? false)
            }
        }
        pictures = line?.pictures ?? true
        greeting = line?.voicemailGreeting ?? ""
        rings = Set(team.filter(\.rings).map(\.id))
        let mine = reply["my_phone"]?.string ?? ""
        myPhone = mine.isEmpty ? "" : formatPhone(toE164(mine) ?? mine)
        saved = Saved(pictures: pictures, greeting: greeting, rings: rings, myPhone: myPhone)
    }

    /// Area code search: three digits, 2 to 9 first.
    public func search() async {
        let code = areaCode.trimmingCharacters(in: .whitespaces)
        guard code.wholeMatch(of: /[2-9][0-9]{2}/) != nil else {
            fieldErrors = ["area_code": "Enter a 3-digit area code."]
            return
        }
        fieldErrors = [:]
        numbers = []
        await run(PhoneText.searching, ["action": "search", "area_code": .string(code)], reload: false) { reply in
            if case .array(let list)? = reply["numbers"] {
                self.numbers = list.compactMap { n in
                    n["number"]?.string.map {
                        FoundNumber(number: $0, locality: n["locality"]?.string, region: n["region"]?.string)
                    }
                }
            }
            if self.numbers.isEmpty { self.result = ("No numbers found in \(code). Try another area code.", true) }
        }
    }

    public func take(_ number: String) async {
        await run("take", ["action": "take", "number": .string(number)])
    }

    public func keep() async {
        guard toE164(keepNumber) != nil else {
            fieldErrors = ["number": "Enter a US phone number."]
            return
        }
        await run("keep", ["action": "keep", "number": .string(keepNumber)])
    }

    public func cancel() async { await run("cancel", ["action": "cancel"]) }

    public func saveLine() async {
        await run(
            "save",
            [
                "action": "save", "pictures": .bool(pictures),
                "ring_user_ids": .array(team.map(\.id).filter { rings.contains($0) }.map { .string($0) }),
                "voicemail_greeting": .string(greeting),
            ])
    }

    public func saveMyPhone() async {
        await run("my_phone", ["action": "my_phone", "phone": .string(myPhone)])
    }

    private func run(
        _ what: String, _ body: [String: JSONValue], reload: Bool = true, then: ((JSONValue) -> Void)? = nil
    ) async {
        busy = what
        defer { busy = nil }
        var payload = body
        payload["company_id"] = .string(companyId)
        do {
            let reply = try await api.post("api/phone", .object(payload))
            fieldErrors = [:]
            result = reply["message"]?.string.map { ($0, false) }
            then?(reply)
            if reload, let fresh = try? await api.get("api/phone", query: ["company_id": companyId]) { apply(fresh) }
        } catch let failure as WebAPI.Failure {
            fieldErrors = failure.fields
            result = (failure.description, true)
        } catch {
            result = (String(describing: error), true)
        }
    }
}
