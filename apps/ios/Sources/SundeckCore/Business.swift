import Foundation

// A second business name, and the tech on reports (Cole via the owner, 2026-11-26;
// docs/design/2026-11-26-second-business-and-tech-photos.md). Port of business.ts. Pure.
//
// A shop with Services = Both may add a second business (name, logo, phone, email, review link,
// main color) for one line of work. Each job uses one of the two on everything the customer sees
// about it. The database works the same out in app.job_business.

/// Which of the shop's two businesses a job uses.
public enum Business: String, Codable, CaseIterable, Hashable, Sendable {
    case main, second
}

/// The line of work the second business is for.
public enum BusinessWork: String, Codable, CaseIterable, Hashable, Sendable {
    case leak, pool

    /// `BUSINESS_WORK_LABELS`
    public var label: String {
        switch self {
        case .leak: "Leak Detection"
        case .pool: "Pool Care"
        }
    }
}

/// The company row's columns these rules read (as synced).
public struct BusinessCompany: Codable, Equatable, Sendable {
    public var name: String
    public var phone: String?
    public var email: String?
    public var logoPath: String?
    public var brandPrimary: String?
    public var reviewUrl: String?
    public var settings: JSONValue?
    public var secondName: String?
    public var secondPhone: String?
    public var secondEmail: String?
    public var secondLogoPath: String?
    public var secondBrandPrimary: String?
    public var secondReviewUrl: String?
    public var secondFor: String?

    enum CodingKeys: String, CodingKey {
        case name, phone, email, settings
        case logoPath = "logo_path"
        case brandPrimary = "brand_primary"
        case reviewUrl = "review_url"
        case secondName = "second_name"
        case secondPhone = "second_phone"
        case secondEmail = "second_email"
        case secondLogoPath = "second_logo_path"
        case secondBrandPrimary = "second_brand_primary"
        case secondReviewUrl = "second_review_url"
        case secondFor = "second_for"
    }

    /// From a synced company row (`name` falls back to `fallbackName` when the row is missing).
    public init(row: [String: JSONValue]?, fallbackName: String = "") {
        let s = { (k: String) in row?[k]?.string }
        name = s("name") ?? fallbackName
        phone = s("phone")
        email = s("email")
        logoPath = s("logo_path")
        brandPrimary = s("brand_primary")
        reviewUrl = s("review_url")
        settings = row?["settings"]
        secondName = s("second_name")
        secondPhone = s("second_phone")
        secondEmail = s("second_email")
        secondLogoPath = s("second_logo_path")
        secondBrandPrimary = s("second_brand_primary")
        secondReviewUrl = s("second_review_url")
        secondFor = s("second_for")
    }
}

/// The job row's columns these rules read.
public struct BusinessJob: Codable, Equatable, Sendable {
    public var type: String
    public var business: String?

    public init(type: String, business: String? = nil) {
        self.type = type
        self.business = business
    }

    /// From a synced job row; nil without one.
    public init?(row: [String: JSONValue]?) {
        guard let row else { return nil }
        type = row["type"]?.string ?? ""
        business = row["business"]?.string
    }
}

/// What a business shows the customer.
public struct BusinessIdentity: Codable, Equatable, Sendable {
    public var business: Business
    public var name: String
    public var phone: String?
    public var email: String?
    public var logoPath: String?
    public var brandPrimary: String?
    public var reviewUrl: String?
}

/// One of the job page's Business choices.
public struct BusinessChoice: Codable, Equatable, Hashable, Sendable {
    public var value: Business
    public var label: String
}

private func blank(_ v: String?) -> String? {
    guard let t = v?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { return nil }
    return t
}

/// The second business's line of work (leak detection unless set to pool care).
public func secondBusinessWork(_ company: BusinessCompany) -> BusinessWork {
    company.secondFor == "pool" ? .pool : .leak
}

/// Whether the shop has a second business in use: Services is Both and it has a name.
public func hasSecondBusiness(_ company: BusinessCompany) -> Bool {
    companyServices(company.settings) == .both && blank(company.secondName) != nil
}

/// The line of work a job type belongs to; nil for a repair (it follows its source job).
public func jobWork(_ type: String) -> BusinessWork? {
    switch type {
    case "detection", "inspection": return .leak
    case "maintenance": return .pool
    default: return nil
    }
}

/// The business for a line of work (used for things tied to no one job, such as autopay).
public func workBusiness(_ company: BusinessCompany, _ work: BusinessWork) -> Business {
    hasSecondBusiness(company) && secondBusinessWork(company) == work ? .second : .main
}

/// Which business a job uses: the main one without a second business; else the job's own choice;
/// else by its line of work; a repair follows the job it came from (`parent`, its own choice or
/// its work) and uses the main one without one.
public func jobBusiness(_ company: BusinessCompany, _ job: BusinessJob, _ parent: BusinessJob? = nil) -> Business {
    if !hasSecondBusiness(company) { return .main }
    if let own = job.business.flatMap(Business.init(rawValue:)) { return own }
    if let work = jobWork(job.type) { return workBusiness(company, work) }
    if job.type == "repair", let parent {
        if let own = parent.business.flatMap(Business.init(rawValue:)) { return own }
        if let work = jobWork(parent.type) { return workBusiness(company, work) }
    }
    return .main
}

/// What a business shows: the second one's name and logo (no logo when it has none, never the
/// main one), and its phone, email, review link and color, each falling back to the main one's.
public func businessIdentity(_ company: BusinessCompany, _ business: Business) -> BusinessIdentity {
    let main = BusinessIdentity(
        business: .main, name: company.name, phone: blank(company.phone), email: blank(company.email),
        logoPath: blank(company.logoPath), brandPrimary: blank(company.brandPrimary),
        reviewUrl: blank(company.reviewUrl))
    if business == .main || !hasSecondBusiness(company) { return main }
    return BusinessIdentity(
        business: .second, name: blank(company.secondName) ?? company.name,
        phone: blank(company.secondPhone) ?? main.phone, email: blank(company.secondEmail) ?? main.email,
        logoPath: blank(company.secondLogoPath), brandPrimary: blank(company.secondBrandPrimary) ?? main.brandPrimary,
        reviewUrl: blank(company.secondReviewUrl) ?? main.reviewUrl)
}

/// The name a job's customer sees (share texts, On My Way, signature statements).
public func jobBusinessName(_ company: BusinessCompany, _ job: BusinessJob?, _ parent: BusinessJob? = nil) -> String {
    guard let job else { return company.name }
    return businessIdentity(company, jobBusiness(company, job, parent)).name
}

/// The Business row's choices on the job page: both names, main first. Empty without one.
public func businessChoices(_ company: BusinessCompany) -> [BusinessChoice] {
    if !hasSecondBusiness(company) { return [] }
    return [
        BusinessChoice(value: .main, label: company.name),
        BusinessChoice(value: .second, label: businessIdentity(company, .second).name),
    ]
}

/// `SECOND_BUSINESS_TEXT`
public enum SecondBusinessText {
    public static let header = "Second Business"
    public static let name = "Business Name"
    public static let logo = "Logo"
    public static let phone = "Phone"
    public static let email = "Email"
    public static let reviewUrl = "Review Link"
    public static let color = "Main Color"
    public static let useFor = "Use For"
    public static let footer =
        "Jobs of this kind, and repairs that come from them, show this name, logo and contact info on reports, quotes, invoices, texts and emails. Everything else uses your main business. Leave the name blank to turn it off."
    /// The job page's row.
    public static let jobRow = "Business"
}

// MARK: - The tech on reports

/// Whether reports end with the tech's photo and name (company.settings.tech_on_reports).
public func showsTechOnReports(_ settings: JSONValue?) -> Bool {
    settings?["tech_on_reports"] == .bool(true)
}

/// `TECH_CARD_TEXT`
public enum TechCardText {
    public static let label = "Show the Tech on Reports"
    public static let footer =
        "Reports end with “Your pool was serviced by Brian” and their photo. Add photos in Team."
    public static let photo = "Photo"
    public static let myPhoto = "Your Photo"
    public static let myPhotoFooter = "Customers see it on reports when your shop shows the tech."
    public static let addPhoto = "Add Photo"
    public static let changePhoto = "Change Photo"
    public static let removePhoto = "Remove Photo"
    /// Photo size saved, square, in pixels.
    public static let size = 512
}

/// One initial for a tech without a photo.
public func techInitial(_ name: String?) -> String {
    guard let first = name?.trimmingCharacters(in: .whitespacesAndNewlines).first else { return "?" }
    return String(first).uppercased()
}

/// Where a member's photo is stored (company-assets): a new name per upload.
public func memberPhotoPath(_ companyId: String, _ userId: String, _ at: Int) -> String {
    "\(companyId)/team/\(userId)-\(at).jpg"
}
