import Foundation
import SundeckCore
import Testing

/// quote-list.ts: standalone quotes and the Quotes list (owner, 2026-11-24).
@Suite struct QuoteListTests {
    let module = "quote-list"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "QUOTE_TEXTS", "isQuoteJob", "quoteSegment", "quoteWaitingForPool", "filterQuotes",
                "quoteSegmentCounts", "quoteTitle", "quoteRowDetail", "validateNewQuote", "newQuoteRecords",
            ] as Set)
    }

    @Test func words() {
        checkRule(module, "QUOTE_TEXTS") { _ -> [String: JSONValue] in
            [
                "QUOTE_SEGMENTS": .array(
                    QuoteSegment.allCases.map { .object(["key": .string($0.rawValue), "label": .string($0.label)]) }),
                "DEFAULT_QUOTE_SEGMENT": .string(QuoteSegment.default.rawValue),
                "QUOTE_NEEDS_POOL": .string(quoteNeedsPool),
                "QUOTES_EMPTY": try JSONValue(encoding: labelTable(\QuoteSegment.emptyText)),
                "QUOTES_EMPTY_SEARCH": .string(quotesEmptySearch),
            ]
        }
        checkRule(module, "quoteTitle") { c in quoteTitle(try c.arg(0, as: Int?.self)) }
        checkRule(module, "quoteRowDetail") { c in
            quoteRowDetail(number: try c.arg(0, as: Int?.self), totalCents: try c.arg(1))
        }
    }

    @Test func rules() {
        checkRule(module, "isQuoteJob") { c in isQuoteJob(status: try c.arg(0)) }
        checkRule(module, "quoteSegment") { c in quoteSegment(try c.arg(0)).rawValue }
        checkRule(module, "quoteWaitingForPool") { c in
            quoteWaitingForPool(status: try c.arg(0), jobStatus: try c.arg(1))
        }
        checkRule(module, "filterQuotes") { c in
            filterQuotes(
                try c.arg(0, as: [QuoteListItem].self), segment: try c.arg(1, as: String?.self),
                q: try c.arg(2, as: String?.self)
            ).map(\.number)
        }
        checkRule(module, "quoteSegmentCounts") { c in
            let counts = quoteSegmentCounts(try c.arg(0, as: [QuoteListItem].self).map(\.status))
            return Dictionary(uniqueKeysWithValues: counts.map { ($0.key.rawValue, $0.value) })
        }
        checkRule(module, "validateNewQuote") { c in validateNewQuote(try c.arg(0)) }
        checkRule(module, "newQuoteRecords") { c -> [String: JSONValue] in
            let r = newQuoteRecords(try c.arg(0), assignedUserId: try c.arg(1, as: String?.self))
            return [
                "customer": r.customer.map(JSONValue.object) ?? .null,
                "property": r.property.map(JSONValue.object) ?? .null,
                "job": .object(r.job), "quote": .object(r.quote),
            ]
        }
    }

    @Test func quoteJobStatus() {
        #expect(JobStatus.quote.label == "Quote")
        #expect(JobStatus.quote.transitions == [.unscheduled])
        #expect(userTransitions(from: .quote).isEmpty)
        #expect(userTransitions(from: .quote, type: "repair").isEmpty)
    }
}
