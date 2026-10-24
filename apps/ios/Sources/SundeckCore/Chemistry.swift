import Foundation

// Pool chemical calculator (owner, 2026-10-16): from the pool's size and today's readings, how
// much of each product to add. Doses are the industry rule-of-thumb amounts per 10,000 gallons
// (county health department charts and CPO course tables), scaled by volume and change. They are
// starting points: add in portions, circulate, and retest.

// MARK: - Readings and targets

/// One of the readings a tech takes. Port of chemistry.ts.
public enum ReadingKey: String, Codable, CaseIterable, Sendable {
    case fc, ph, ta, ch, cya, salt

    /// The reading's name in the calculator.
    public var label: String {
        switch self {
        case .fc: "Free chlorine"
        case .ph: "pH"
        case .ta: "Alkalinity"
        case .ch: "Calcium"
        case .cya: "Stabilizer"
        case .salt: "Salt"
        }
    }

    /// How close to a chosen level counts as there: closer than this, nothing is added.
    var goalTolerance: Double {
        switch self {
        case .fc: 0.5
        case .ph: 0.1
        case .ta: 10
        case .ch: 25
        case .cya: 5
        case .salt: 100
        }
    }
}

/// Today's readings; also the levels a tech chose instead of the recommended targets.
public struct Readings: Codable, Equatable, Sendable {
    /// Free chlorine, ppm.
    public var fc: Double?
    public var ph: Double?
    /// Total alkalinity, ppm.
    public var ta: Double?
    /// Calcium hardness, ppm.
    public var ch: Double?
    /// Cyanuric acid (stabilizer), ppm.
    public var cya: Double?
    /// Salt, ppm (salt pools; left blank otherwise).
    public var salt: Double?

    public init(
        fc: Double? = nil, ph: Double? = nil, ta: Double? = nil, ch: Double? = nil, cya: Double? = nil,
        salt: Double? = nil
    ) {
        self.fc = fc
        self.ph = ph
        self.ta = ta
        self.ch = ch
        self.cya = cya
        self.salt = salt
    }

    public subscript(key: ReadingKey) -> Double? {
        switch key {
        case .fc: fc
        case .ph: ph
        case .ta: ta
        case .ch: ch
        case .cya: cya
        case .salt: salt
        }
    }
}

/// A reading's acceptable range and the level to aim for (`Range` in chemistry.ts).
public struct ReadingRange: Codable, Equatable, Sendable {
    public var low: Double
    public var high: Double
    public var target: Double
}

/// The range for each reading.
public struct ChemistryTargets: Codable, Equatable, Sendable {
    public var fc, ph, ta, ch, cya, salt: ReadingRange

    public subscript(key: ReadingKey) -> ReadingRange {
        switch key {
        case .fc: fc
        case .ph: ph
        case .ta: ta
        case .ch: ch
        case .cya: cya
        case .salt: salt
        }
    }
}

/// The ranges a residential pool aims for. One set for every pool; a tech who wants another
/// level types it under Aim For. Free chlorine scales with stabilizer.
public func targets(_ cya: Double? = nil) -> ChemistryTargets {
    // Free chlorine should stay near 7.5% of the stabilizer level, never under 2.
    let fcMin = max(2, ECMA.round((cya ?? 40) * 0.075 * 2) / 2)
    return ChemistryTargets(
        fc: ReadingRange(low: fcMin, high: fcMin + 3, target: fcMin + 1),
        ph: ReadingRange(low: 7.4, high: 7.6, target: 7.5),
        ta: ReadingRange(low: 80, high: 120, target: 100),
        ch: ReadingRange(low: 200, high: 400, target: 300),
        cya: ReadingRange(low: 30, high: 80, target: 40),
        salt: ReadingRange(low: 2700, high: 3400, target: 3200))
}

// MARK: - Products

/// Chlorine products the calculator doses.
public enum ChlorineProduct: String, Codable, CaseIterable, Sendable {
    case liquid12, liquid10, calhypo65, calhypo73

    public var label: String {
        switch self {
        case .liquid12: "Liquid chlorine 12.5%"
        case .liquid10: "Liquid chlorine 10%"
        case .calhypo65: "Cal-hypo 65%"
        case .calhypo73: "Cal-hypo 73%"
        }
    }

    /// Fluid ounces (liquids) or ounces (solids) per 10,000 gallons for +1 ppm free chlorine
    /// (stoichiometry: 10.2 fl oz of 12.5%; charts say 10.6 to 10.7).
    var per10k: Double {
        switch self {
        case .liquid12: 10.7
        case .liquid10: 13.4
        case .calhypo65: 2.0
        case .calhypo73: 1.8
        }
    }

    var isLiquid: Bool { rawValue.hasPrefix("liquid") }
}

/// Acids the calculator doses.
public enum AcidProduct: String, Codable, CaseIterable, Sendable {
    case muriatic31, muriatic145, dryacid

    public var label: String {
        switch self {
        case .muriatic31: "Muriatic acid 31.45%"
        case .muriatic145: "Muriatic acid 14.5%"
        case .dryacid: "Dry acid (sodium bisulfate)"
        }
    }

    /// Per 10,000 gallons for -0.2 pH at 100 ppm alkalinity (labels say 12 to 16 fl oz of
    /// 31.45%; this stays near the low end, since too much acid is the worse mistake).
    var perPh: Double {
        switch self {
        case .muriatic31: 13
        case .muriatic145: 30.5
        case .dryacid: 17.3
        }
    }

    /// Per 10,000 gallons for -10 ppm total alkalinity (7.6 mol of acid).
    var perTa: Double {
        switch self {
        case .muriatic31: 25.6
        case .muriatic145: 60
        case .dryacid: 34
        }
    }

    var isLiquid: Bool { rawValue.hasPrefix("muriatic") }
}

// Per 10,000 gallons, in ounces by weight.
private let sodaAshPh = 6.0  // +0.2 pH
private let bakingSodaTa = 22.4  // +10 ppm TA (1.4 lb)
private let calciumChlorideCh = 19.3  // +10 ppm CH (1.2 lb of 77%)
private let cyaUp = 13.3  // +10 ppm CYA
private let saltUp = 133.4  // +100 ppm salt (8.34 lb)

// MARK: - The calculation

/// One thing to add or do.
public struct DoseStep: Codable, Equatable, Sendable {
    public var key: ReadingKey
    /// What to add, or what to do ("Drain and refill about 25%").
    public var product: String
    /// The exact amount ("1 gal 26 fl oz", "3.5 lb"); nil when the step is an action.
    public var amount: String?
    /// The same amount the way a tech measures it on the deck: "A splash", "2 cups",
    /// "½ gallon", "3½ lb", "2 bags".
    public var measure: String?
    /// Why, in words: "pH 8.0 → 7.5".
    public var why: String
    public var note: String?
    /// The chemical the step adds, as the price book knows it (`chemicalKeys`); nil for an
    /// action (drain, hold off on chlorine). Owner, 2026-10-24: added chemicals.
    public var chemical: String?
    /// The amount in `unit` ("gal", "lb", "bag"), as the tech measures and the shop bills it.
    public var quantity: Double?
    public var unit: String?
}

/// `CHEMICAL_KEYS`: what a dose step or a price book item can be (`price_book_item.chemical`).
public let chemicalKeys = [
    "liquid_chlorine", "muriatic_acid", "dry_acid", "cal_hypo", "tabs", "baking_soda", "soda_ash",
    "calcium_chloride", "stabilizer", "salt", "algaecide", "clarifier", "enzyme", "phosphate_remover",
]

extension ChlorineProduct {
    /// Both strengths of liquid chlorine are the one chemical the shop sells.
    var chemical: String { isLiquid ? "liquid_chlorine" : "cal_hypo" }
}

extension AcidProduct {
    var chemical: String { isLiquid ? "muriatic_acid" : "dry_acid" }
}

private func round2(_ n: Double) -> Double { ECMA.round(n * 100) / 100 }

/// Gallons as the everyday measure reads them (`gallonQuantity`): a splash or cups as their part
/// of a gallon, then the measure's thirds and quarters, then quarters and halves.
public func gallonQuantity(_ flOz: Double) -> Double {
    if flOz < 6 { return max(0.01, round2(flOz / 128)) }
    if flOz <= 24 { return round2(max(0.5, ECMA.round((flOz / 8) * 2) / 2) / 16) }
    let gallons = flOz / 128
    if gallons < 0.875 {
        let part = partGallon.dropFirst().reduce(partGallon[0]) { a, b in
            abs(b.0 - gallons) < abs(a.0 - gallons) ? b : a
        }
        return round2(part.0)
    }
    let step = gallons > 4 ? 0.5 : 0.25
    return max(0.25, ECMA.round(gallons / step) * step)
}

/// Pounds (or bags) as the dry measure reads them (`dryQuantity`).
public func dryQuantity(_ oz: Double, _ bag: Double? = nil) -> Double {
    if let bag, bag != 0, !bag.isNaN { return max(0.5, ECMA.round((oz / 16 / bag) * 2) / 2) }
    if oz < 6 { return max(0.01, round2(oz / 16)) }
    let lb = oz / 16
    let step = lb <= 10 ? 0.5 : lb <= 40 ? 1 : 5
    return max(0.5, ECMA.round(lb / step) * step)
}

/// How one reading compares with its range.
public struct ReadingStatus: Codable, Equatable, Sendable {
    public enum Status: String, Codable, Sendable { case low, ok, high }

    public var key: ReadingKey
    public var label: String
    public var value: Double
    public var range: ReadingRange
    public var status: Status
}

/// What the calculator shows.
public struct ChemistryResult: Codable, Equatable, Sendable {
    public var statuses: [ReadingStatus]
    /// In the order to add them: alkalinity, pH, calcium, stabilizer, salt, chlorine.
    public var steps: [DoseStep]
    /// Langelier saturation index (water balance), when pH, TA, and CH are known.
    public var lsi: Double?
    public var lsiLabel: String?
}

/// The calculator's input.
public struct ChemistryInput: Codable, Equatable, Sendable {
    public var gallons: Double
    public var readings: Readings
    public var chlorine: ChlorineProduct
    public var acid: AcidProduct
    /// Levels the tech wants instead of the recommended targets; empty keys use the target.
    public var goals: Readings?

    public init(
        gallons: Double, readings: Readings, chlorine: ChlorineProduct, acid: AcidProduct, goals: Readings? = nil
    ) {
        self.gallons = gallons
        self.readings = readings
        self.chlorine = chlorine
        self.acid = acid
        self.goals = goals
    }
}

/// The range to judge a reading by when the tech picked a level: aim for it exactly and start
/// adding below it. pH and alkalinity come down with acid, so above the level they come down
/// too; the rest only come down by draining, so above it they are flagged only past the usual
/// high.
public func goalRange(_ range: ReadingRange, _ key: ReadingKey, _ goal: Double?) -> ReadingRange {
    guard let goal, goal.isFinite, goal >= 0 else { return range }
    let tol = key.goalTolerance
    return ReadingRange(
        low: goal - tol,
        high: key == .ph || key == .ta ? goal + tol : max(range.high, goal + tol),
        target: goal)
}

/// "1 gal 26 fl oz", "12 fl oz".
public func fluidAmount(_ flOz: Double) -> String {
    let oz = ECMA.round(flOz)
    if oz < 128 { return "\(ECMA.numberString(max(1, oz))) fl oz" }
    let gal = (oz / 128).rounded(.down)
    let rest = oz - gal * 128
    return rest != 0
        ? "\(ECMA.numberString(gal)) gal \(ECMA.numberString(rest)) fl oz" : "\(ECMA.numberString(gal)) gal"
}

/// ¼, ½, ¾ as characters: 1.5 → "1½", 0.25 → "¼".
private func fraction(_ n: Double) -> String {
    let whole = n.rounded(.down)
    let part: String =
        switch n - whole {
        case 0.25: "¼"
        case 0.5: "½"
        case 0.75: "¾"
        default: ""
        }
    return whole != 0 ? "\(ECMA.numberString(whole))\(part)" : part.isEmpty ? "0" : part
}

/// Parts of a gallon under one: thirds too, so 47 and 48 fl oz both read ⅓.
private let partGallon: [(Double, String)] = [(0.25, "¼"), (1.0 / 3, "⅓"), (0.5, "½"), (2.0 / 3, "⅔"), (0.75, "¾")]

/// Liquids the way they're poured: a splash (under 6 fl oz), cups up to 3, then gallons:
/// quarters and thirds under one gallon, quarters to 4, halves past that.
public func gallonMeasure(_ flOz: Double) -> String {
    if flOz < 6 { return "A splash" }
    if flOz <= 24 {
        let cups = max(0.5, ECMA.round((flOz / 8) * 2) / 2)
        return "\(fraction(cups)) \(cups > 1 ? "cups" : "cup")"
    }
    let gallons = flOz / 128
    if gallons < 0.875 {
        let part = partGallon.dropFirst().reduce(partGallon[0]) { a, b in
            abs(b.0 - gallons) < abs(a.0 - gallons) ? b : a
        }
        return "\(part.1) gallon"
    }
    let step = gallons > 4 ? 0.5 : 0.25
    let n = max(0.25, ECMA.round(gallons / step) * step)
    return "\(fraction(n)) \(n > 1 ? "gallons" : "gallon")"
}

/// Dry products by the scoop or the pound, rounded the way they're weighed out: a scoop (under
/// 6 oz), then the nearest ½ lb up to 10 lb, the nearest pound to 40, and 5 lb past that. Salt
/// goes by the 40 lb bag.
public func dryMeasure(_ oz: Double, _ bag: Double? = nil) -> String {
    if let bag, bag != 0, !bag.isNaN {
        let bags = max(0.5, ECMA.round((oz / 16 / bag) * 2) / 2)
        return "\(fraction(bags)) \(bags > 1 ? "bags" : "bag")"
    }
    if oz < 6 { return "A scoop" }
    let lb = oz / 16
    let step = lb <= 10 ? 0.5 : lb <= 40 ? 1 : 5
    return "\(fraction(max(0.5, ECMA.round(lb / step) * step))) lb"
}

/// "10 oz", "3.5 lb".
public func weightAmount(_ oz: Double) -> String {
    if oz < 16 { return "\(ECMA.numberString(max(1, ECMA.round(oz)))) oz" }
    let lb = oz / 16
    return "\(ECMA.numberString(lb >= 20 ? ECMA.round(lb) : ECMA.round(lb * 10) / 10)) lb"
}

private func fmt(_ n: Double, _ key: ReadingKey) -> String {
    switch key {
    case .ph: toFixed1(n)
    case .fc: ECMA.numberString(ECMA.round(n * 10) / 10)
    default: ECMA.numberString(ECMA.round(n))
    }
}

private func finite(_ v: Double?) -> Double? {
    guard let v, v.isFinite else { return nil }
    return v
}

/// Langelier saturation index: below -0.3 the water is corrosive, above 0.3 it scales. The
/// calculator doesn't ask for water temperature, so it uses 80 °F, a typical swimming pool
/// (temperature factor 0.65).
public func saturationIndex(_ r: Readings) -> Double? {
    guard let ph = finite(r.ph), let ta = finite(r.ta), let ch = finite(r.ch), ch > 0 else { return nil }
    // Carbonate alkalinity: stabilizer accounts for about a third of its ppm in the reading.
    let carb = ta - (finite(r.cya).map { $0 / 3 } ?? 0)
    if carb <= 0 { return nil }
    // Dissolved solids: a salt pool's salt raises them.
    let tds = (finite(r.salt).map { $0 >= 1000 } ?? false) ? 12.2 : 12.1
    let lsi = ph + 0.65 + log10(ch) - 0.4 + log10(carb) - tds
    return ECMA.round(lsi * 10) / 10
}

/// One line for the calculator's docked bar: the first step in everyday words, without the
/// product's strength, and how many more ("½ gallon muriatic acid · 1 more").
public func doseSummary(_ result: ChemistryResult, _ ready: Bool) -> String {
    if !ready { return "Add the gallons and a reading" }
    guard let first = result.steps.first else { return "Balanced. Nothing to add." }
    let product = first.product.replacing(/\ \d+(\.\d+)?%/, with: "", maxReplacements: 1)
    let what = first.measure.map { "\($0) \(product.lowercased())" } ?? product
    let rest = result.steps.count - 1
    return rest > 0 ? "\(what) · \(rest) more" : what
}

private typealias Dose = (amount: String, measure: String, chemical: String, quantity: Double, unit: String)

/// The exact amount and the everyday measure, for a liquid (fl oz) or a dry product (oz), with
/// the chemical and its quantity in the unit it's sold by.
private func dose(_ qty: Double, _ liquid: Bool, _ chemical: String, _ bag: Double? = nil) -> Dose {
    liquid
        ? (fluidAmount(qty), gallonMeasure(qty), chemical, gallonQuantity(qty), "gal")
        : (weightAmount(qty), dryMeasure(qty, bag), chemical, dryQuantity(qty, bag), bag == nil ? "lb" : "bag")
}

/// What to add, in order, and how each reading stands.
public func calculateChemistry(_ input: ChemistryInput) -> ChemistryResult {
    let r = input.readings
    let goals = input.goals ?? Readings()
    let base = targets(r.cya)
    let k = max(0, input.gallons) / 10_000
    var statuses: [ReadingStatus] = []
    var steps: [DoseStep] = []

    for key in ReadingKey.allCases {
        guard let v = finite(r[key]) else { continue }
        let range = goalRange(base[key], key, goals[key])
        statuses.append(
            ReadingStatus(
                key: key, label: key.label, value: v, range: range,
                status: v < range.low ? .low : v > range.high ? .high : .ok))
    }
    func st(_ key: ReadingKey) -> ReadingStatus? { statuses.first { $0.key == key } }
    func why(_ key: ReadingKey, _ from: Double, _ to: Double) -> String {
        "\(key.label) \(fmt(from, key)) → \(fmt(to, key))"
    }
    func step(
        _ key: ReadingKey, _ product: String, _ dose: Dose?, _ why: String,
        note: String? = nil
    ) -> DoseStep {
        DoseStep(
            key: key, product: product, amount: dose?.amount, measure: dose?.measure, why: why, note: note,
            chemical: dose?.chemical, quantity: dose?.quantity, unit: dose?.unit)
    }
    func drain(_ key: ReadingKey, _ from: Double, _ to: Double) -> DoseStep {
        let percent = min(90, (((from - to) / from) * 20).rounded(.up) * 5)
        return step(
            key, "Drain and refill about \(ECMA.numberString(percent))%", nil, why(key, from, to),
            note: "Nothing added lowers it; fresh water does.")
    }

    // Alkalinity first: it steadies pH.
    let ta = st(.ta)
    var taAfter = ta?.value ?? 100
    if let ta, ta.status != .ok {
        let d = ta.range.target - ta.value
        if d > 0 {
            steps.append(
                step(
                    .ta, "Baking soda", dose((d / 10) * bakingSodaTa * k, false, "baking_soda"),
                    why(.ta, ta.value, ta.range.target)))
        } else {
            let amt = (-d / 10) * input.acid.perTa * k
            steps.append(
                step(
                    .ta, input.acid.label, dose(amt, input.acid.isLiquid, input.acid.chemical),
                    why(.ta, ta.value, ta.range.target),
                    note:
                        "Add in two or three doses a few hours apart, running the pump, and aerate to bring pH back up."
                ))
        }
        taAfter = ta.range.target
    }

    // pH, scaled by alkalinity (more buffer takes more to move).
    if let ph = st(.ph), ph.status != .ok {
        let buffer = min(2, max(0.5, taAfter / 100))
        let d = ph.range.target - ph.value
        if d > 0 {
            steps.append(
                step(
                    .ph, "Soda ash", dose((d / 0.2) * sodaAshPh * buffer * k, false, "soda_ash"),
                    why(.ph, ph.value, ph.range.target)))
        } else {
            let amt = (-d / 0.2) * input.acid.perPh * buffer * k
            steps.append(
                step(
                    .ph, input.acid.label, dose(amt, input.acid.isLiquid, input.acid.chemical),
                    why(.ph, ph.value, ph.range.target),
                    note: "Pour into the deep end with the pump running. Add acid to water, never water to acid."))
        }
    }

    if let ch = st(.ch) {
        if ch.status == .low {
            steps.append(
                step(
                    .ch, "Calcium chloride 77%",
                    dose(((ch.range.target - ch.value) / 10) * calciumChlorideCh * k, false, "calcium_chloride"),
                    why(.ch, ch.value, ch.range.target)))
        } else if ch.status == .high {
            steps.append(drain(.ch, ch.value, ch.range.target))
        }
    }

    if let cya = st(.cya) {
        if cya.status == .low {
            steps.append(
                step(
                    .cya, "Stabilizer (cyanuric acid)",
                    dose(((cya.range.target - cya.value) / 10) * cyaUp * k, false, "stabilizer"),
                    why(.cya, cya.value, cya.range.target),
                    note: "Dissolves slowly; put it in a sock in the skimmer basket. Retest in a week."))
        } else if cya.status == .high {
            steps.append(drain(.cya, cya.value, cya.range.target))
        }
    }

    if let salt = st(.salt) {
        if salt.status == .low {
            steps.append(
                step(
                    .salt, "Pool salt", dose(((salt.range.target - salt.value) / 100) * saltUp * k, false, "salt", 40),
                    why(.salt, salt.value, salt.range.target),
                    note: "Brush it toward the main drain until it dissolves."))
        } else if salt.status == .high {
            steps.append(drain(.salt, salt.value, salt.range.target))
        }
    }

    // Chlorine last.
    if let fc = st(.fc) {
        if fc.status == .low {
            let amt = (fc.range.target - fc.value) * input.chlorine.per10k * k
            steps.append(
                step(
                    .fc, input.chlorine.label, dose(amt, input.chlorine.isLiquid, input.chlorine.chemical),
                    why(.fc, fc.value, fc.range.target),
                    note: input.chlorine.isLiquid
                        ? nil : "Also raises calcium a little. Pre-dissolve in a bucket of pool water."))
        } else if fc.status == .high {
            steps.append(
                step(
                    .fc, "Hold off on chlorine", nil, why(.fc, fc.value, fc.range.target),
                    note: "Sun and time bring it down. Don't swim above 10 ppm."))
        }
    }

    let lsi = saturationIndex(r)
    let lsiLabel = lsi.map { $0 < -0.3 ? "Corrosive" : $0 > 0.3 ? "Scale forming" : "Balanced" }
    return ChemistryResult(statuses: statuses, steps: steps, lsi: lsi, lsiLabel: lsiLabel)
}

// MARK: - The pool's chemical log (owner, 2026-10-19)

/// One Submit from the Chemical screen: the pool's gallons and the readings the tech typed,
/// with the products they dose with (`chemical_reading`, a synced row).
public struct ChemicalReading: Codable, Equatable, Sendable {
    public var id: String
    public var propertyId: String
    public var jobId: String?
    public var recordedAt: String
    public var recordedBy: String?
    public var gallons: Double?
    public var fc: Double?
    public var ph: Double?
    public var ta: Double?
    public var ch: Double?
    public var cya: Double?
    public var salt: Double?
    public var chlorineProduct: ChlorineProduct?
    public var acidProduct: AcidProduct?
    public var notes: String?
    /// The Aim For levels the tech used (owner, 2026-10-24).
    public var goals: Readings?

    enum CodingKeys: String, CodingKey {
        case id
        case propertyId = "property_id"
        case jobId = "job_id"
        case recordedAt = "recorded_at"
        case recordedBy = "recorded_by"
        case gallons, fc, ph, ta, ch, cya, salt
        case chlorineProduct = "chlorine_product"
        case acidProduct = "acid_product"
        case notes, goals
    }

    public init(
        id: String, propertyId: String, jobId: String? = nil, recordedAt: String, recordedBy: String? = nil,
        gallons: Double? = nil, fc: Double? = nil, ph: Double? = nil, ta: Double? = nil, ch: Double? = nil,
        cya: Double? = nil, salt: Double? = nil, chlorineProduct: ChlorineProduct? = nil,
        acidProduct: AcidProduct? = nil, notes: String? = nil, goals: Readings? = nil
    ) {
        self.id = id
        self.propertyId = propertyId
        self.jobId = jobId
        self.recordedAt = recordedAt
        self.recordedBy = recordedBy
        self.gallons = gallons
        self.fc = fc
        self.ph = ph
        self.ta = ta
        self.ch = ch
        self.cya = cya
        self.salt = salt
        self.chlorineProduct = chlorineProduct
        self.acidProduct = acidProduct
        self.notes = notes
        self.goals = goals
    }

    /// The readings that were taken.
    public var readings: Readings { Readings(fc: fc, ph: ph, ta: ta, ch: ch, cya: cya, salt: salt) }
}

/// A plausible range for a typed reading; outside it the value is a typo, not a reading.
public struct ReadingLimit: Codable, Equatable, Sendable {
    public var min: Double
    public var max: Double
}

extension ReadingKey {
    /// `READING_LIMITS`.
    public var limit: ReadingLimit {
        switch self {
        case .fc: ReadingLimit(min: 0, max: 100)
        case .ph: ReadingLimit(min: 0, max: 14)
        case .ta: ReadingLimit(min: 0, max: 1000)
        case .ch: ReadingLimit(min: 0, max: 5000)
        case .cya: ReadingLimit(min: 0, max: 1000)
        case .salt: ReadingLimit(min: 0, max: 20000)
        }
    }

    /// The reading's short name in a log line ("FC", "pH", ...).
    var shortLabel: String {
        switch self {
        case .fc: "FC"
        case .ph: "pH"
        case .ta: "TA"
        case .ch: "CH"
        case .cya: "CYA"
        case .salt: "Salt"
        }
    }
}

/// "FC 3 · pH 7.6 · TA 90": the readings that were taken, in the calculator's order.
public func readingSummary(_ r: Readings) -> String {
    ReadingKey.allCases.compactMap { key in
        r[key].map { "\(key.shortLabel) \(key == .ph ? ECMA.toFixed($0, 1) : ECMA.numberString($0))" }
    }
    .joined(separator: " · ")
}

// MARK: - JavaScript number formatting

/// `n.toFixed(1)` in JavaScript: an exact tie (a multiple of 0.05 that a double holds exactly,
/// such as 7.25) rounds away from zero, where printf rounds it to even.
private func toFixed1(_ n: Double) -> String {
    if n == 0 { return "0.0" }
    let quarters = n * 4
    if quarters.rounded() == quarters, Int(quarters.magnitude) % 2 == 1, abs(n) < 1e15 {
        let tenths = (n * 10).rounded(.awayFromZero)
        return String(format: "%.1f", tenths / 10)
    }
    return String(format: "%.1f", n)
}

// MARK: - A visit report's water test (owner, 2026-10-20)

public struct WaterTestRow: Codable, Equatable, Sendable {
    public var key: ReadingKey
    public var label: String
    public var value: Double
    /// "7.4–7.6"
    public var range: String
    /// low, ok or high.
    public var status: String
    /// "In range", "Low", "High"
    public var statusLabel: String
}

/// Each reading taken, in the calculator's order, against its range (`waterTestRows`). A reading
/// the tech aimed for a level shows that level and is judged by it (owner, 2026-10-24).
public func waterTestRows(_ r: Readings, goals: Readings? = nil) -> [WaterTestRow] {
    let t = targets(r.cya)
    let order: [ReadingKey] = [.fc, .ph, .ta, .ch, .cya, .salt]
    return order.compactMap { k in
        guard let value = r[k], value.isFinite else { return nil }
        let goal = finite(goals?[k])
        let chosen = goal.map { $0 >= 0 } ?? false
        let range = goalRange(t[k], k, goal)
        let status = value < range.low ? "low" : value > range.high ? "high" : "ok"
        return WaterTestRow(
            key: k, label: k.label, value: value,
            range: chosen
                ? fmt(goal!, k) : "\(ECMA.numberString(range.low))–\(ECMA.numberString(range.high))",
            status: status,
            statusLabel: status == "ok" ? "In range" : status == "low" ? "Low" : "High")
    }
}
