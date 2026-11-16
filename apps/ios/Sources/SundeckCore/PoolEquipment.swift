import Foundation

/// pool-equipment.ts: a pool's sanitizer, heater and solar heater (owner, 2026-11-16: "chlorine or
/// salt pool, spa or no spa, pool gallons, gate code, does it have heater, solar heater").
public enum Sanitizer: String, Codable, CaseIterable, Sendable {
    case chlorine, salt, bromine, other

    /// The picker's choice.
    public var label: String {
        switch self {
        case .chlorine: "Chlorine"
        case .salt: "Salt"
        case .bromine: "Bromine"
        case .other: "Other"
        }
    }

    /// In the pool's summary line.
    var summary: String { self == .other ? "Other sanitizer" : label }
}

public enum Heater: String, Codable, CaseIterable, Sendable {
    case none, gas
    case heatPump = "heat_pump"
    case electric, other

    /// The picker's choice.
    public var label: String {
        switch self {
        case .none: "None"
        case .gas: "Gas"
        case .heatPump: "Heat pump"
        case .electric: "Electric"
        case .other: "Other"
        }
    }

    /// In the pool's summary line.
    var summary: String {
        switch self {
        case .none: "No heater"
        case .gas: "Gas heater"
        case .heatPump: "Heat pump"
        case .electric: "Electric heater"
        case .other: "Other heater"
        }
    }
}

/// What the pool's summary line reads from a property row.
public struct PoolSummaryInput: Decodable, Sendable {
    public var poolType: String?
    public var hasSpa: Bool?
    public var approxGallons: Double?
    public var sanitizer: String?
    public var heater: String?
    public var hasSolarHeater: Bool?

    enum CodingKeys: String, CodingKey {
        case sanitizer, heater
        case poolType = "pool_type"
        case hasSpa = "has_spa"
        case approxGallons = "approx_gallons"
        case hasSolarHeater = "has_solar_heater"
    }

    public init(
        poolType: String? = nil, hasSpa: Bool? = nil, approxGallons: Double? = nil, sanitizer: String? = nil,
        heater: String? = nil, hasSolarHeater: Bool? = nil
    ) {
        self.poolType = poolType
        self.hasSpa = hasSpa
        self.approxGallons = approxGallons
        self.sanitizer = sanitizer
        self.heater = heater
        self.hasSolarHeater = hasSolarHeater
    }
}

/// The pool's line under its address: "Gunite / plaster · Pool and spa · 20,000 gallons · Salt ·
/// Gas heater · Solar heater". What isn't known is left out.
public func poolSummary(_ p: PoolSummaryInput) -> String {
    var gallons: String?
    if let n = p.approxGallons, n != 0 {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "en_US")
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        f.roundingMode = .halfUp
        gallons = f.string(from: NSNumber(value: n.rounded())).map { "\($0) gallons" }
    }
    return [
        p.poolType.flatMap(PoolType.init(rawValue:))?.label,
        p.hasSpa == true ? "Pool and spa" : "Pool",
        gallons,
        p.sanitizer.flatMap(Sanitizer.init(rawValue:))?.summary,
        p.heater.flatMap(Heater.init(rawValue:))?.summary,
        p.hasSolarHeater == true ? "Solar heater" : nil,
    ]
    .compactMap { $0 }.joined(separator: " · ")
}
