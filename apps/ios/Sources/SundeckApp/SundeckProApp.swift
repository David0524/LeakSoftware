#if os(iOS)
    import Observation
    import Sentry
    import SundeckStorage
    import SwiftUI

    @main
    struct SundeckProApp: App {
        @State private var model = ToolchainCheckModel()

        init() {
            if let dsn = AppConfig.sentryDSN {
                SentrySDK.start { options in
                    options.dsn = dsn
                }
            }
        }

        var body: some Scene {
            WindowGroup {
                ToolchainCheckView(model: model)
                    .task { model.openDatabase() }
            }
        }
    }

    /// S0's one screen (docs/plans/swift-app.md): the encrypted database, sign-in to the dev
    /// project, and error reporting. Replaced by the real app shell in S3.
    @MainActor @Observable
    final class ToolchainCheckModel {
        var databaseStatus = "Opening…"
        var databaseOK = false
        var email = ""
        var password = ""
        var signedInAs: String?
        var pullStatus: String?
        var serverError: String?
        var busy = false
        var testErrorSent = false

        private let server = ServerCheck(client: ServerCheck.makeClient())

        func openDatabase() {
            do {
                let folder = try FileManager.default.url(
                    for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                let db = try Database(
                    path: folder.appendingPathComponent("sundeck.db").path, key: DatabaseKey.loadOrCreate())
                if let version = try db.cipherVersion() {
                    databaseStatus = "Encrypted (SQLCipher \(version))"
                    databaseOK = true
                } else {
                    databaseStatus = "Not encrypted"
                }
            } catch {
                databaseStatus = "Couldn’t open: \(error)"
            }
        }

        func signIn() async {
            busy = true
            serverError = nil
            defer { busy = false }
            do {
                signedInAs = try await server.signIn(
                    email: email.trimmingCharacters(in: .whitespaces), password: password)
                password = ""
                let count = try await server.firstPullRowCount()
                pullStatus = count == 1 ? "1 record" : "\(count) records"
            } catch {
                serverError = error.localizedDescription
            }
        }

        func signOut() async {
            try? await server.signOut()
            signedInAs = nil
            pullStatus = nil
        }

        func sendTestError() {
            struct ToolchainCheckError: Error {}
            SentrySDK.capture(error: ToolchainCheckError())
            testErrorSent = true
        }
    }

    struct ToolchainCheckView: View {
        @Bindable var model: ToolchainCheckModel

        var body: some View {
            NavigationStack {
                List {
                    Section {
                        LabeledContent("Local Database") {
                            Label(
                                model.databaseStatus,
                                systemImage: model.databaseOK ? "lock.fill" : "exclamationmark.triangle")
                        }
                    } header: {
                        Text("This iPhone")
                    } footer: {
                        Text("Customer details on the phone are kept in an encrypted database.")
                    }

                    Section {
                        if let signedInAs = model.signedInAs {
                            LabeledContent("Signed In As", value: signedInAs)
                            LabeledContent("First Sync Page", value: model.pullStatus ?? "Loading…")
                            Button("Sign Out") { Task { await model.signOut() } }
                        } else {
                            TextField("Email", text: $model.email)
                                .textContentType(.username)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                            SecureField("Password", text: $model.password)
                                .textContentType(.password)
                            Button {
                                Task { await model.signIn() }
                            } label: {
                                HStack {
                                    Text("Sign In")
                                    if model.busy {
                                        Spacer()
                                        ProgressView()
                                    }
                                }
                            }
                            .disabled(model.busy || model.email.isEmpty || model.password.isEmpty)
                        }
                    } header: {
                        Text("Server")
                    } footer: {
                        if let error = model.serverError {
                            Text(error).foregroundStyle(.red)
                        } else {
                            Text("Signs in to the development server.")
                        }
                    }

                    Section {
                        Button(model.testErrorSent ? "Test Error Sent" : "Send Test Error") {
                            model.sendTestError()
                        }
                        .disabled(AppConfig.sentryDSN == nil || model.testErrorSent)
                    } header: {
                        Text("Error Reporting")
                    } footer: {
                        Text(
                            AppConfig.sentryDSN == nil
                                ? "Error reporting is off in this build."
                                : "Sends a test error to Sentry.")
                    }
                }
                .navigationTitle("Sundeck Pro")
            }
        }
    }
#endif
