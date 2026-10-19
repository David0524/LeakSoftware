#if os(iOS)
    import Supabase
    import SundeckSync
    import SwiftUI

    // Sign in, create an account, the two-step code, first setup, and signing in again.
    // Ports of apps/mobile/src/app/(auth)/sign-in.tsx, sign-up.tsx, app/code.tsx, app/setup.tsx and
    // app/(app)/reauth.tsx, with the same wording.

    struct SignInFlow: View {
        var body: some View {
            NavigationStack { SignInView() }
        }
    }

    struct SignInView: View {
        @Environment(Session.self) private var session
        @State private var email = ""
        @State private var password = ""
        @State private var error: String?
        @State private var busy = false
        @FocusState private var focus: Field?

        enum Field { case email, password }

        var body: some View {
            Form {
                if let error {
                    Section { Notice(kind: .error, text: error) }.listRowInsets(EdgeInsets()).listRowBackground(
                        Color.clear)
                }
                Section {
                    TextField("Email", text: $email, prompt: Text(verbatim: "name@company.com"))
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.next)
                        .focused($focus, equals: .email)
                        .onSubmit { focus = .password }
                    SecureField("Password", text: $password, prompt: Text("Required"))
                        .textContentType(.password)
                        .submitLabel(.go)
                        .focused($focus, equals: .password)
                        .onSubmit { Task { await signIn() } }
                }
                Section {
                    Button {
                        Task { await signIn() }
                    } label: {
                        if busy { ProgressView().tint(Color.onPrimary) } else { Text("Sign In") }
                    }
                    .buttonStyle(.primary)
                    .disabled(busy)
                    NavigationLink("Create an Account") { SignUpView() }
                        .frame(maxWidth: .infinity, minHeight: minTarget)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
                #if DEBUG
                    Section {
                        Notice(
                            kind: .info,
                            text:
                                "Demo accounts (dev only): tech@demo.leakbook.test or owner@demo.leakbook.test, password leakbook-demo"
                        )
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                #endif
            }
            .navigationTitle("Sign In")
        }

        private func signIn() async {
            guard !email.isEmpty, !password.isEmpty else {
                error = "Enter your email and password."
                return
            }
            busy = true
            defer { busy = false }
            do {
                try await session.signIn(email: email, password: password)
                error = nil
            } catch {
                self.error = String(describing: error)
            }
        }
    }

    struct SignUpView: View {
        @Environment(Session.self) private var session
        @Environment(\.dismiss) private var dismiss
        @State private var name = ""
        @State private var email = ""
        @State private var password = ""
        @State private var error: String?
        @State private var confirmEmail = false
        @State private var busy = false

        var body: some View {
            Form {
                Section {
                    Text(
                        "If your company already uses Sundeck Pro, ask the owner to invite this email, then sign up here."
                    )
                    .font(.subheadline).foregroundStyle(Color.muted)
                }
                .listRowBackground(Color.clear)
                if let error {
                    Section { Notice(kind: .error, text: error) }.listRowInsets(EdgeInsets()).listRowBackground(
                        Color.clear)
                }
                if confirmEmail {
                    Section {
                        Notice(
                            kind: .info,
                            text: "Check your email and tap the link to confirm your account, then sign in.")
                    }
                    .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                }
                Section {
                    TextField("Your name", text: $name, prompt: Text("Required")).textContentType(.name)
                    TextField("Email", text: $email, prompt: Text(verbatim: "name@company.com"))
                        .textContentType(.username).keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField("Password", text: $password, prompt: Text("Required")).textContentType(.newPassword)
                } footer: {
                    Text("At least 10 characters.")
                }
                Section {
                    Button {
                        Task { await signUp() }
                    } label: {
                        if busy { ProgressView().tint(Color.onPrimary) } else { Text("Create Account") }
                    }
                    .buttonStyle(.primary)
                    .disabled(busy)
                    Button("I Already Have an Account") { dismiss() }
                        .frame(maxWidth: .infinity, minHeight: minTarget)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
            .navigationTitle("Create an Account")
        }

        private func signUp() async {
            guard !name.trimmingCharacters(in: .whitespaces).isEmpty, !email.isEmpty else {
                error = "Enter your name and email."
                return
            }
            guard password.count >= 10 else {
                error = "Use a password of at least 10 characters."
                return
            }
            busy = true
            defer { busy = false }
            do {
                let signedIn = try await session.signUp(name: name, email: email, password: password)
                confirmEmail = !signedIn
                error = nil
            } catch {
                self.error = String(describing: error)
            }
        }
    }

    struct CodeView: View {
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @State private var code = ""
        @State private var error: String?
        @State private var busy = false

        var body: some View {
            NavigationStack {
                Form {
                    Section {
                        Text("Open your authenticator app and enter the 6-digit code for Sundeck Pro.")
                            .font(.subheadline).foregroundStyle(Color.muted)
                    }
                    .listRowBackground(Color.clear)
                    if let error {
                        Section { Notice(kind: .error, text: error) }.listRowInsets(EdgeInsets())
                            .listRowBackground(Color.clear)
                    }
                    if sync.status.pending > 0 {
                        Section {
                            Notice(
                                kind: .warning,
                                text:
                                    "This phone has \(changeCount(sync.status.pending)) waiting to send. Enter your code to send them; signing out would lose them."
                            )
                        }
                        .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                    }
                    Section {
                        TextField("Code", text: $code, prompt: Text(verbatim: "123456"))
                            .keyboardType(.numberPad)
                            .textContentType(.oneTimeCode)
                            .onChange(of: code) { _, new in if new.count > 7 { code = String(new.prefix(7)) } }
                    }
                    Section {
                        Button {
                            Task { await verify() }
                        } label: {
                            if busy { ProgressView().tint(Color.onPrimary) } else { Text("Continue") }
                        }
                        .buttonStyle(.primary)
                        .disabled(busy)
                        Button("Sign Out") { Task { await session.cancelCode() } }
                            .frame(maxWidth: .infinity, minHeight: minTarget)
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
                .navigationTitle("Enter Your Code")
            }
        }

        private func verify() async {
            busy = true
            defer { busy = false }
            do {
                try await session.verifyCode(code)
                error = nil
            } catch {
                self.error = String(describing: error)
            }
        }
    }

    /// Signed in, but this phone has no company yet: the first download, or joining a team.
    struct SetupView: View {
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @State private var invite = ""
        @State private var error: String?
        @State private var joining = false

        var body: some View {
            NavigationStack {
                Form {
                    if !sync.status.initialSyncDone {
                        downloading
                    } else {
                        joinTeam
                    }
                    Section {
                        Button("Sign Out") { Task { await session.signOut() } }
                            .frame(maxWidth: .infinity, minHeight: minTarget)
                    }
                    .listRowBackground(Color.clear)
                }
                .navigationTitle(sync.status.initialSyncDone ? "Welcome to Sundeck Pro" : "")
            }
        }

        @ViewBuilder private var downloading: some View {
            Section {
                if sync.status.phase == .offline {
                    Notice(
                        kind: .warning,
                        text:
                            "Connect to the internet once so this phone can download your company. After that, it works without signal."
                    )
                } else {
                    HStack(spacing: 12) {
                        ProgressView()
                        Text("Downloading your company…")
                    }
                    .frame(maxWidth: .infinity, minHeight: minTarget)
                }
                if let message = sync.status.error { Notice(kind: .error, text: message) }
                Button("Try Again") { Task { await sync.syncNow() } }.buttonStyle(.secondary)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
        }

        @ViewBuilder private var joinTeam: some View {
            Section {
                Text("Signed in as \(session.user?.email ?? "")").font(.subheadline).foregroundStyle(Color.muted)
            }
            .listRowBackground(Color.clear)
            if let error {
                Section { Notice(kind: .error, text: error) }.listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
            }
            Section {
                TextField("Invite code", text: $invite, prompt: Text("From your email"))
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .submitLabel(.join)
                    .onSubmit { Task { await join() } }
                Button {
                    Task { await join() }
                } label: {
                    if joining { ProgressView() } else { Text("Join") }
                }
                .disabled(joining)
            } header: {
                Text("Join Your Team")
            } footer: {
                Text("Use the invite code your owner sent to \(session.user?.email ?? "your email").")
            }
            Section {
                Text(
                    "The owner sets up the shop on the Sundeck Pro website, then signs in here with the same email."
                )
                .font(.subheadline)
            } header: {
                Text("Starting a New Shop?")
            }
        }

        private func join() async {
            let code = invite.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !code.isEmpty else {
                error = "Enter the invite code from your email."
                return
            }
            joining = true
            defer { joining = false }
            do {
                try await app.client.rpc("accept_invite", params: ["invite_token": code]).execute()
                error = nil
                await sync.syncNow()
            } catch let failure as PostgrestError {
                error = failure.message
            } catch {
                self.error = "No connection. Try again when you're online."
            }
        }
    }

    /// The session expired: sign in again with the same email. Nothing on the phone changes.
    struct ReauthView: View {
        @Environment(Session.self) private var session
        @Environment(\.dismiss) private var dismiss
        @State private var password = ""
        @State private var error: String?
        @State private var busy = false

        var body: some View {
            NavigationStack {
                Form {
                    Section {
                        Text("Signed in as \(session.user?.email ?? ""). Everything on this phone stays put.")
                            .font(.subheadline).foregroundStyle(Color.muted)
                    }
                    .listRowBackground(Color.clear)
                    if let error {
                        Section { Notice(kind: .error, text: error) }.listRowInsets(EdgeInsets())
                            .listRowBackground(Color.clear)
                    }
                    Section {
                        SecureField("Password", text: $password, prompt: Text("Required"))
                            .textContentType(.password)
                    }
                    Section {
                        Button {
                            Task { await signIn() }
                        } label: {
                            if busy { ProgressView().tint(Color.onPrimary) } else { Text("Sign In") }
                        }
                        .buttonStyle(.primary)
                        .disabled(busy || password.isEmpty)
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
                .navigationTitle("Sign In Again")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                }
            }
        }

        private func signIn() async {
            busy = true
            defer { busy = false }
            do {
                try await session.signInAgain(password: password)
                dismiss()
            } catch {
                self.error = String(describing: error)
            }
        }
    }

    func changeCount(_ n: Int) -> String { n == 1 ? "1 change" : "\(n) changes" }
#endif
