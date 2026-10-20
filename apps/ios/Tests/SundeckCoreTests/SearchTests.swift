import Foundation
import SundeckCore
import Testing

/// search.ts: one search across the shop, and Recent.
@Suite struct SearchTests {
    let module = "search"

    @Test func everyRuleIsChecked() {
        let checked: Set<String> = [
            "constants", "foldText", "searchWords", "normalizeSearch", "noResultsText", "shortDate", "searchShop",
            "rememberRecent", "parseRecent", "recentFromHit",
        ]
        #expect(Fixtures.rules(module) == checked)
    }

    /// An ISO timestamp from a fixture as a Date.
    static func date(_ iso: String) throws -> Date {
        guard let date = ISO8601DateFormatter().date(from: iso) else { throw NotRepresentable() }
        return date
    }

    @Test func words() {
        checkRule(module, "constants") { _ in
            JSONValue.object([
                "SEARCH_PLACEHOLDER": .string(SearchText.placeholder),
                "SEARCH_MIN_CHARS": .number(Double(SearchText.minChars)),
                "SEARCH_DEBOUNCE_MS": .number(Double(SearchText.debounceMs)),
                "SEARCH_GROUP_LIMIT": .number(Double(SearchText.groupLimit)),
                "SEARCH_OFFLINE": .string(SearchText.offline),
                "RECENT_LIMIT": .number(Double(SearchText.recentLimit)),
                "SEARCH_WORDS": .object([
                    "recent": .string(SearchText.recent), "clear": .string(SearchText.clear),
                    "seeAll": .string(SearchText.seeAll), "allResults": .string(SearchText.allResults),
                    "cancel": .string(SearchText.cancel), "search": .string(SearchText.search),
                    "noRecent": .string(SearchText.noRecent),
                ]),
                "SEARCH_GROUP_TITLES": .object(
                    Dictionary(uniqueKeysWithValues: SearchGroupKey.allCases.map { ($0.rawValue, .string($0.title)) })),
            ])
        }
        checkRule(module, "noResultsText") { c in noResultsText(try c.arg(0)) }
    }

    @Test func normalizing() {
        checkRule(module, "foldText") { c in foldText(try c.arg(0, as: String?.self)) }
        checkRule(module, "searchWords") { c in searchWords(try c.arg(0, as: String?.self)) }
        checkRule(module, "normalizeSearch") { c in normalizeSearch(try c.arg(0)) }
        checkRule(module, "shortDate") { c in
            try shortDate(c.arg(0), now: Self.date(c.arg(1)), timeZone: c.arg(2))
        }
    }

    struct Options: Decodable {
        let now: String
        let timeZone: String
        let limit: Int?
        let group: SearchGroupKey?
    }

    @Test func searching() {
        checkRule(module, "searchShop") { c in
            let o = try c.arg(2, as: Options.self)
            return try searchShop(
                c.arg(0), c.arg(1, as: SearchRecords.self), now: Self.date(o.now), timeZone: o.timeZone,
                limit: o.limit ?? SearchText.groupLimit, group: o.group)
        }
    }

    @Test func recent() {
        checkRule(module, "rememberRecent") { c in
            rememberRecent(try c.arg(0, as: [RecentItem].self), try c.arg(1, as: RecentItem.self))
        }
        checkRule(module, "parseRecent") { c in parseRecent(try c.arg(0, as: JSONValue.self)) }
        checkRule(module, "recentFromHit") { c in recentFromHit(try c.arg(0, as: SearchHit.self)) }
    }

    @Test func phoneDigitsNeedFour() throws {
        #expect(normalizeSearch("555").digits == nil)
        #expect(normalizeSearch("(602) 555").digits == "602555")
        let records = SearchRecords(customers: [SearchCustomer(id: "c", name: "Sam", phone: "602-555-0142")])
        let found = try searchShop("0142", records, now: Date(), timeZone: "UTC")
        #expect(found.groups.first?.hits.first?.id == "c")
    }
}
