#if os(iOS)
    import SundeckCore
    import SwiftUI
    import UIKit
    import UserNotifications

    /// The app's delegate for notifications: iOS hands it the push token, asks how to show a
    /// notification that arrives while the app is open (a banner), and says which one was tapped.
    final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
        /// Set once the app's environment exists; a token or tap before that waits in `pending*`.
        @MainActor static weak var environment: AppEnvironment? {
            didSet { environment.map(deliverPending) }
        }
        @MainActor private static var pendingToken: Data?
        @MainActor private static var pendingLink: AppLink?

        func application(
            _ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?
        ) -> Bool {
            UNUserNotificationCenter.current().delegate = self
            return true
        }

        func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken token: Data) {
            MainActor.assumeIsolated {
                if let environment = Self.environment {
                    environment.received(token)
                } else {
                    Self.pendingToken = token
                }
            }
        }

        func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {}

        /// While the app is open: a banner, in the list, with its sound.
        nonisolated func userNotificationCenter(
            _ center: UNUserNotificationCenter, willPresent notification: UNNotification
        ) async -> UNNotificationPresentationOptions {
            [.banner, .list, .sound]
        }

        /// A tapped notification opens its job, or its conversation in Messages.
        nonisolated func userNotificationCenter(
            _ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse
        ) async {
            guard let link = AppLink(push: response.notification.request.content.userInfo) else { return }
            await MainActor.run {
                if let environment = Self.environment {
                    environment.link = link
                } else {
                    Self.pendingLink = link
                }
            }
        }

        @MainActor private static func deliverPending(_ environment: AppEnvironment) {
            if let token = pendingToken { environment.received(token) }
            if let link = pendingLink { environment.link = link }
            pendingToken = nil
            pendingLink = nil
        }
    }

    /// Asking iOS for notifications and the push token.
    @MainActor
    enum NotificationPermission {
        static func status() async -> UNAuthorizationStatus {
            await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        }

        /// iOS's own prompt, then a token when allowed.
        static func request() async {
            let granted =
                (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]))
                ?? false
            if granted { UIApplication.shared.registerForRemoteNotifications() }
        }

        /// On launch and sign-in: a fresh token when notifications are allowed (iOS may change it).
        static func registerIfAllowed() async {
            switch await status() {
            case .authorized, .provisional, .ephemeral: UIApplication.shared.registerForRemoteNotifications()
            default: break
            }
        }

        /// Whether to ask: not asked on this phone yet, and iOS hasn't been asked either.
        static func shouldAsk(_ push: PushRegistration) async -> Bool {
            guard !push.asked else { return false }
            if await status() == .notDetermined { return true }
            push.asked = true
            return false
        }
    }

    /// More › Notifications (website more/notifications): a switch per kind, saved as it changes;
    /// when iOS has notifications off for the app, a row that opens its Settings first.
    struct NotificationsScreen: View {
        @Environment(AppEnvironment.self) private var app
        @Environment(\.scenePhase) private var scenePhase
        @Environment(\.openURL) private var openURL
        @State private var form: NotificationPrefsForm?
        @State private var systemOff = false

        var body: some View {
            ScreenScroll {
                if systemOff {
                    Grouped(footer: NotificationPrefsForm.systemOff) {
                        Button {
                            if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
                        } label: {
                            ListRow(NotificationPrefsForm.openSettings, chevron: true)
                        }
                        .buttonStyle(.row)
                    }
                }
                if let form {
                    Grouped(footer: NotificationPrefsForm.footer) {
                        ForEach(notificationKinds, id: \.key) { kind in
                            SwitchRow(
                                kind.label, detail: kind.hint,
                                isOn: Binding(
                                    get: { form.isOn(kind.key) },
                                    set: { on in Task { await form.set(kind.key, on, api: app.api) } }))
                        }
                    }
                    if let error = form.error { Notice(kind: .error, text: error) }
                }
            }
            .navigationTitle(NotificationPrefsForm.title)
            .navigationBarTitleDisplayMode(.large)
            .task {
                let form = self.form ?? NotificationPrefsForm(kv: app.session.sync.kv)
                self.form = form
                await checkSystem()
                await form.load(app.api)
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { Task { await checkSystem() } }
            }
        }

        private func checkSystem() async {
            let status = await NotificationPermission.status()
            systemOff = status == .denied
            if status == .authorized || status == .provisional { await NotificationPermission.registerIfAllowed() }
        }
    }
#endif
