import XCTest

/// Owner, 2026-10-24: "The app crashes a lot the moment I close out of it." Runs the real app in
/// the simulator as the demo tech: Today and Schedule, then the Home Screen for 35 seconds (past
/// the ~30 seconds iOS gives a background task) and back, five times, then closes it. A crash
/// while away shows as the app no longer running; the workflow saves the crash reports.
final class BackgroundingTests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    func testLeavingAndComingBackDoesNotCrash() throws {
        let app = XCUIApplication()
        // iOS's own prompts (notifications, location) are answered so they don't block the taps.
        addUIInterruptionMonitor(withDescription: "System prompt") { alert in
            for title in ["Don’t Allow", "Don't Allow", "Allow", "OK"] where alert.buttons[title].exists {
                alert.buttons[title].tap()
                return true
            }
            return false
        }
        app.launch()
        // The database key is in the Keychain: an unsigned build can't reach it and stops here.
        XCTAssertFalse(
            app.staticTexts["Sundeck Pro Couldn’t Start"].waitForExistence(timeout: 5),
            "The app couldn't open its storage (is the simulator build signed?)")
        signIn(app)
        let today = app.tabBars.buttons["Today"]
        // The first download runs before Today shows.
        XCTAssertTrue(today.waitForExistence(timeout: 240), "The app didn't open after signing in")
        attach(app, "signed-in")

        for round in 1...5 {
            today.tap()
            sleep(2)
            app.tabBars.buttons["Schedule"].tap()
            sleep(2)
            XCUIDevice.shared.press(.home)
            sleep(35)
            XCTAssertNotEqual(app.state, .notRunning, "The app stopped while in the background (round \(round))")
            app.activate()
            XCTAssertTrue(today.waitForExistence(timeout: 30), "The app didn't come back (round \(round))")
            attach(app, "back-\(round)")
        }
        XCUIDevice.shared.press(.home)
        sleep(5)
        XCTAssertNotEqual(app.state, .notRunning, "The app stopped on leaving the last time")
        app.terminate()
    }

    private func signIn(_ app: XCUIApplication) {
        let email = app.textFields["Email"]
        guard email.waitForExistence(timeout: 30) else { return }  // already signed in
        email.tap()
        email.typeText("tech@demo.leakbook.test")
        let password = app.secureTextFields["Password"]
        password.tap()
        password.typeText("leakbook-demo")
        app.buttons["Sign In"].firstMatch.tap()
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
