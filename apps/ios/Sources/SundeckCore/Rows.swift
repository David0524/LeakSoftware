/// A job row, with the fields the ported rules read. Port of the Job shape in models.ts.
public struct Job: Codable, Equatable, Sendable {
    public var id: String
    public var status: JobStatus
    public var scheduledStart: String?
    public var startedAt: String?
    public var createdAt: String?
    public var deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, status
        case scheduledStart = "scheduled_start"
        case startedAt = "started_at"
        case createdAt = "created_at"
        case deletedAt = "deleted_at"
    }
}

/// A property (a customer's pool), with the fields the ported rules read. Port of the
/// Property shape in models.ts.
public struct Property: Codable, Equatable, Sendable {
    public var addressLine1: String
    public var city: String?
    public var state: String?
    public var postalCode: String?
    public var poolType: PoolType?
    public var hasPool: Bool
    public var hasSpa: Bool
    public var latitude: Double?
    public var longitude: Double?

    enum CodingKeys: String, CodingKey {
        case city, state, latitude, longitude
        case addressLine1 = "address_line1"
        case postalCode = "postal_code"
        case poolType = "pool_type"
        case hasPool = "has_pool"
        case hasSpa = "has_spa"
    }
}
