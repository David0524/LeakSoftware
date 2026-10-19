import Foundation

/// What the New job screen collects. Port of forms.ts.
public struct NewJobInput: Codable, Equatable, Sendable {
    /// An existing customer (an empty id counts as none).
    public var customerId: String?
    public var customerName: String
    public var customerPhone: String
    public var customerEmail: String
    /// An existing property (an empty id counts as none).
    public var propertyId: String?
    public var addressLine1: String
    public var city: String
    public var state: String
    public var postalCode: String
    /// YYYY-MM-DD and HH:MM in the shop's time zone, or empty.
    public var scheduleDate: String
    public var scheduleTime: String

    public init(
        customerId: String? = nil, customerName: String = "", customerPhone: String = "", customerEmail: String = "",
        propertyId: String? = nil, addressLine1: String = "", city: String = "", state: String = "",
        postalCode: String = "", scheduleDate: String = "", scheduleTime: String = ""
    ) {
        self.customerId = customerId
        self.customerName = customerName
        self.customerPhone = customerPhone
        self.customerEmail = customerEmail
        self.propertyId = propertyId
        self.addressLine1 = addressLine1
        self.city = city
        self.state = state
        self.postalCode = postalCode
        self.scheduleDate = scheduleDate
        self.scheduleTime = scheduleTime
    }
}

/// An id that is set and not empty (JavaScript's truthy string).
private func present(_ id: String?) -> Bool { !(id ?? "").isEmpty }

/// `^[^\s@]+@[^\s@]+\.[^\s@]+$`: no spaces, one @, and a dot with text on both sides after it.
private func looksLikeEmail(_ text: String) -> Bool {
    let s = Array(text.unicodeScalars)
    guard !s.contains(where: ECMA.isWhitespace), s.filter({ $0 == "@" }).count == 1,
        let at = s.firstIndex(of: "@"), at > 0
    else { return false }
    let domain = s[(at + 1)...]
    return domain.indices.contains { domain[$0] == "." && $0 > domain.startIndex && $0 < domain.endIndex - 1 }
}

private func isASCIIDigit(_ c: Unicode.Scalar) -> Bool { ("0"..."9").contains(c) }

/// `^\d{4}-\d{2}-\d{2}$`
private func isDateFormat(_ text: String) -> Bool {
    let s = Array(text.unicodeScalars)
    return s.count == 10 && s.enumerated().allSatisfy { i, c in i == 4 || i == 7 ? c == "-" : isASCIIDigit(c) }
}

/// `^([01]?\d|2[0-3]):[0-5]\d$`
private func isTimeFormat(_ text: String) -> Bool {
    let parts = text.unicodeScalars.split(separator: ":", omittingEmptySubsequences: false).map(Array.init)
    guard parts.count == 2 else { return false }
    let (h, m) = (parts[0], parts[1])
    let hourOK =
        switch h.count {
        case 1: isASCIIDigit(h[0])
        case 2: (("0"..."1").contains(h[0]) && isASCIIDigit(h[1])) || (h[0] == "2" && ("0"..."3").contains(h[1]))
        default: false
        }
    return hourOK && m.count == 2 && ("0"..."5").contains(m[0]) && isASCIIDigit(m[1])
}

/// Errors by field name (the `NewJobInput` property) for the New job form.
public func validateNewJob(_ input: NewJobInput) -> [String: String] {
    var errors: [String: String] = [:]
    if !present(input.customerId) && ECMA.trim(input.customerName).isEmpty {
        errors["customerName"] = "Enter the customer's name."
    }
    let email = ECMA.trim(input.customerEmail)
    if !present(input.customerId) && !email.isEmpty && !looksLikeEmail(email) {
        errors["customerEmail"] = "Check the email address."
    }
    if !present(input.propertyId) && ECMA.trim(input.addressLine1).isEmpty {
        errors["addressLine1"] = "Enter the street address."
    }
    if !input.scheduleDate.isEmpty && !isDateFormat(input.scheduleDate) {
        errors["scheduleDate"] = "Use the format YYYY-MM-DD."
    }
    if !input.scheduleTime.isEmpty && !isTimeFormat(input.scheduleTime) {
        errors["scheduleTime"] = "Use 24-hour time, like 09:30 or 14:00."
    }
    if !input.scheduleTime.isEmpty && input.scheduleDate.isEmpty {
        errors["scheduleDate"] = "Pick a date for this time."
    }
    return errors
}

/// Convert a wall-clock date and time in a time zone to an ISO instant.
/// Works by measuring the zone's offset at that moment, as the TypeScript does.
func zonedTimeToIso(_ date: String, _ time: String, _ timeZone: String) throws -> String {
    // `split("-").map(Number)`: a missing part is NaN, an empty one 0.
    func numbers(_ s: String, _ separator: Character, _ count: Int) -> [Double] {
        let parts = s.split(separator: separator, omittingEmptySubsequences: false).map { ECMA.number(String($0)) }
        return (0..<count).map { $0 < parts.count ? parts[$0] : .nan }
    }
    let d = numbers(date, "-", 3)
    let t = numbers(time.isEmpty ? "08:00" : time, ":", 2)
    let guess = ECMA.dateUTC(d[0], d[1] - 1, d[2], t[0], t[1])
    let zone = try ECMA.zone(timeZone)
    guard guess.isFinite else { throw DateRuleError.invalidTimeValue }
    let offset = { (instant: Double) -> Double in
        let wall = ECMA.wallClock(instant, zone)
        let wallMs = ECMA.dateUTC(
            Double(wall.year), Double(wall.month - 1), Double(wall.day), Double(wall.hour), Double(wall.minute))
        return wallMs - instant
    }
    // Two passes handle instants near a daylight saving change.
    var utc = guess - offset(guess)
    utc = guess - offset(utc)
    return try ECMA.isoString(utc)
}

/// "1423 Palm Ct, Phoenix, AZ 85016", leaving out the parts that are missing.
public func formatAddress(_ p: Property) -> String {
    let stateZip = [p.state, p.postalCode].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
    let cityLine = [p.city ?? "", stateZip].filter { !$0.isEmpty }.joined(separator: ", ")
    return [p.addressLine1, cityLine].filter { !$0.isEmpty }.joined(separator: ", ")
}

/// When a new job happens: started now, scheduled in the shop's time zone, or later.
public enum JobTiming: Equatable, Sendable {
    case now(at: Date)
    case scheduled(date: String, time: String, timeZone: String)
    case later
}

/// The rest of the New job screen.
public struct NewJobDetails: Equatable, Sendable {
    public var poolType: PoolType?
    public var hasSpa: Bool
    public var accessNotes: String
    public var timing: JobTiming
    public var assignedUserId: String?
    /// Leak detection (default), a pool service visit, or a repair.
    public var jobType: JobType?

    public init(
        poolType: PoolType?, hasSpa: Bool, accessNotes: String, timing: JobTiming, assignedUserId: String?,
        jobType: JobType? = nil
    ) {
        self.poolType = poolType
        self.hasSpa = hasSpa
        self.accessNotes = accessNotes
        self.timing = timing
        self.assignedUserId = assignedUserId
        self.jobType = jobType
    }
}

/// The new customer row's fields.
public struct NewCustomerValues: Codable, Equatable, Sendable {
    public var kind = "homeowner"
    public var name: String
    public var phone: String?
    public var email: String?
}

/// The new property row's fields (the customer id is added when saving).
public struct NewPropertyValues: Codable, Equatable, Sendable {
    public var addressLine1: String
    public var city: String?
    public var state: String?
    public var postalCode: String?
    public var poolType: PoolType?
    public var hasPool: Bool
    public var hasSpa: Bool
    public var accessNotes: String?

    enum CodingKeys: String, CodingKey {
        case city, state
        case addressLine1 = "address_line1"
        case postalCode = "postal_code"
        case poolType = "pool_type"
        case hasPool = "has_pool"
        case hasSpa = "has_spa"
        case accessNotes = "access_notes"
    }
}

/// The new job row's fields (the property and bill-to customer are added when saving).
public struct NewJobValues: Codable, Equatable, Sendable {
    public var type: JobType
    public var assignedUserId: String?
    public var status: JobStatus
    public var startedAt: String?
    public var scheduledStart: String?

    enum CodingKeys: String, CodingKey {
        case type, status
        case assignedUserId = "assigned_user_id"
        case startedAt = "started_at"
        case scheduledStart = "scheduled_start"
    }
}

/// The rows the New job screen creates; nil for a customer or property that is reused.
public struct NewJobRecords: Codable, Equatable, Sendable {
    public var customer: NewCustomerValues?
    public var property: NewPropertyValues?
    public var job: NewJobValues
}

/// Field values for the rows the New job screen creates. Existing customer or property ids
/// in `input` mean that row is reused and not returned.
public func newJobRecords(_ input: NewJobInput, _ d: NewJobDetails) throws -> NewJobRecords {
    let blankToNil = { (s: String) -> String? in
        let trimmed = ECMA.trim(s)
        return trimmed.isEmpty ? nil : trimmed
    }
    let customer =
        present(input.customerId)
        ? nil
        : NewCustomerValues(
            name: ECMA.trim(input.customerName), phone: blankToNil(input.customerPhone),
            email: blankToNil(input.customerEmail))
    let property =
        present(input.propertyId)
        ? nil
        : NewPropertyValues(
            addressLine1: ECMA.trim(input.addressLine1), city: blankToNil(input.city),
            state: blankToNil(input.state)?.uppercased(), postalCode: blankToNil(input.postalCode),
            poolType: d.poolType, hasPool: true, hasSpa: d.hasSpa, accessNotes: blankToNil(d.accessNotes))
    var job = NewJobValues(type: d.jobType ?? .detection, assignedUserId: d.assignedUserId, status: .unscheduled)
    switch d.timing {
    case .now(let at):
        job.status = .inProgress
        job.startedAt = try ECMA.isoString(ECMA.milliseconds(at))
    case .scheduled(let date, let time, let timeZone):
        job.status = .scheduled
        job.scheduledStart = try zonedTimeToIso(date, time, timeZone)
    case .later:
        break
    }
    return NewJobRecords(customer: customer, property: property, job: job)
}
