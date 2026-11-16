import Foundation
import SundeckCore
import Testing

/// feedback: Customer Feedback's words and the reminder channel (owner's competitor notes, 2026-11-16).
@Suite struct FeedbackTests {
    let module = "feedback"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "FEEDBACK_FILTERS", "feedbackWords", "feedbackFilter", "feedbackOpenLabel", "feedbackSubtitle",
                "feedbackNotification", "reminderChannel", "askFeedbackFirst",
            ])
    }

    @Test func words() {
        checkRule(module, "FEEDBACK_FILTERS") { _ in
            FeedbackFilter.allCases.map { ["value": $0.rawValue, "label": $0.label] }
        }
        checkRule(module, "feedbackWords") { _ in
            [
                "FEEDBACK_TITLE": JSONValue.string(FeedbackText.title),
                "FEEDBACK_EMPTY": .object(
                    Dictionary(
                        uniqueKeysWithValues: FeedbackFilter.allCases.map {
                            ($0.rawValue, JSONValue.string(FeedbackText.empty($0)))
                        })),
                "FEEDBACK_OFFLINE": .string(FeedbackText.offline),
                "FEEDBACK_WORDS": .object([
                    "close": .string(FeedbackText.close),
                    "reopen": .string(FeedbackText.reopen),
                    "noteLabel": .string(FeedbackText.noteLabel),
                    "notePlaceholder": .string(FeedbackText.notePlaceholder),
                    "noComment": .string(FeedbackText.noComment),
                    "thumbsUp": .string(FeedbackText.thumbsUp),
                    "customerSection": .string(FeedbackText.customerSection),
                    "seeAll": .string(FeedbackText.seeAll),
                    "settingTitle": .string(FeedbackText.settingTitle),
                    "settingHint": .string(FeedbackText.settingHint),
                ]),
                "REMINDER_CHANNELS": .array(
                    ReminderChannel.allCases.map {
                        .object(["value": .string($0.rawValue), "label": .string($0.label)])
                    }),
                "REMINDER_CHANNEL_HINT": .string(FeedbackText.reminderChannelHint),
            ]
        }
    }

    @Test func lists() {
        checkRule(module, "feedbackFilter") { c in
            guard let filter = FeedbackFilter(rawValue: try c.arg(1)) else { throw NotRepresentable() }
            return feedbackFilter(try c.arg(0), filter).map(\.id)
        }
        checkRule(module, "feedbackOpenLabel") { c in feedbackOpenLabel(try c.arg(0)) }
        checkRule(module, "feedbackSubtitle") { c in
            feedbackSubtitle(jobNumber: try c.arg(0, as: Int?.self), when: try c.arg(1))
        }
        checkRule(module, "feedbackNotification") { c in
            feedbackNotification(try c.arg(0), try c.arg(1, as: String?.self))
        }
    }

    @Test func settings() {
        checkRule(module, "reminderChannel") { c in reminderChannel(try c.arg(0, as: JSONValue?.self)).rawValue }
        checkRule(module, "askFeedbackFirst") { c in askFeedbackFirst(try c.arg(0, as: JSONValue?.self)) }
    }
}
