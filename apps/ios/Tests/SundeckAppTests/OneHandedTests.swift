import Foundation
import SundeckCore
import SundeckLiveStop
import SundeckSync
import Testing

@testable import SundeckApp

/// One-handed use in the field (owner, 2026-10-20; docs/design/2026-10-20-one-handed-use.md):
/// the rules behind the keyboard bar, swipes, the report prompt, photos and the Live Activity's
/// actions.
@MainActor @Suite struct OneHandedTests {
    @Test func theKeyboardBarMovesThroughTheFieldsInOrder() {
        let order = ["start_psi", "end_psi", "duration_min", "notes"]
        #expect(fieldStep(order, from: "start_psi", by: 1) == "end_psi")
        #expect(fieldStep(order, from: "end_psi", by: -1) == "start_psi")
        #expect(fieldStep(order, from: "start_psi", by: -1) == nil)
        #expect(fieldStep(order, from: "notes", by: 1) == nil)
        #expect(fieldStep(order, from: nil, by: 1) == "start_psi")
        #expect(fieldStep(order, from: nil, by: -1) == nil)
        #expect(KeyboardBarText.previous == "Previous" && KeyboardBarText.next == "Next")
    }

    @Test func aSwipeNeedsSeventyPointsAndMostlySideways() {
        let start = CGPoint(x: 200, y: 300)
        #expect(PageSwipeRule.direction(start: start, translation: CGSize(width: -70, height: 0)) == 1)
        #expect(PageSwipeRule.direction(start: start, translation: CGSize(width: -69, height: 0)) == 0)
        // 1.8 times as far sideways as up or down: 90 by 50 counts, 90 by 51 doesn't.
        #expect(PageSwipeRule.direction(start: start, translation: CGSize(width: 90, height: 50)) == -1)
        #expect(PageSwipeRule.direction(start: start, translation: CGSize(width: 90, height: 51)) == 0)
    }

    @Test func completingAskSendsOnlyWhenTheReportGoesOutByItself() {
        #expect(CompleteSendPrompt.asks(jobType: .maintenance, settings: ["visit_reports": "auto"]))
        #expect(!CompleteSendPrompt.asks(jobType: .maintenance, settings: ["visit_reports": "manual"]))
        #expect(!CompleteSendPrompt.asks(jobType: .maintenance, settings: ["visit_reports": "off"]))
        #expect(!CompleteSendPrompt.asks(jobType: .detection, settings: ["visit_reports": "auto"]))
        #expect(!CompleteSendPrompt.asks(jobType: .repair, settings: ["visit_reports": "auto"]))
        #expect(CompleteSendPrompt.title == "Ready to send the visit report?")
        #expect(CompleteSendPrompt.confirm == "Complete and Send" && CompleteSendPrompt.cancel == "Cancel")
        #expect(
            CompleteSendPrompt.message(customer: "Maria Lopez")
                == "Completing this visit sends its report to Maria Lopez.")
        #expect(CompleteSendPrompt.message(customer: nil) == "Completing this visit sends its report to the customer.")
        #expect(CompleteSendPrompt.message(customer: " ") == "Completing this visit sends its report to the customer.")
    }

    @Test func theCameraOpensAgainAfterAPhotoUntilCancel() {
        #expect(CaptureRules.cameraOpensAgain(.photo, took: true))
        #expect(!CaptureRules.cameraOpensAgain(.photo, took: false))
        #expect(!CaptureRules.cameraOpensAgain(.video, took: true))
    }

    @Test func attachToIsRememberedPerJob() {
        let job = "job-\(UUID())"
        #expect(CaptureTargetMemory.target(for: job) == nil)
        CaptureTargetMemory.remember(MediaTarget(jobId: job, findingId: "f1"))
        #expect(CaptureTargetMemory.target(for: job) == MediaTarget(jobId: job, findingId: "f1"))
        #expect(CaptureTargetMemory.target(for: "other-\(UUID())") == nil)
    }

    @Test func theLiveActivityActionsOpenTheStopAndDoIt() throws {
        let url = try #require(LiveStopLink.action(.markComplete, jobId: "j1"))
        #expect(url.absoluteString == "sundeckpro://job/j1/mark-complete")
        #expect(LiveStopLink.jobId(url) == "j1")
        #expect(LiveStopLink.action(url) == .markComplete)
        #expect(AppLink(url: url) == .stop("j1", .markComplete))
        let onMyWay = try #require(LiveStopLink.action(.onMyWay, jobId: "j1"))
        #expect(AppLink(url: onMyWay) == .stop("j1", .onMyWay))
        // A plain job link still opens the job.
        #expect(AppLink(url: try #require(LiveStopLink.job("j1"))) == .job("j1"))
        #expect(LiveStopLink.actions(.ahead) == [.onMyWay, .markComplete])
        #expect(LiveStopLink.actions(.driving) == [.markComplete])
        #expect(LiveStopLink.actions(.onSite) == [.markComplete])
        #expect(LiveStopLink.actions(.done).isEmpty)
        #expect(LiveStopAction.onMyWay.title == "On My Way" && LiveStopAction.markComplete.title == "Mark Complete")
    }
}
