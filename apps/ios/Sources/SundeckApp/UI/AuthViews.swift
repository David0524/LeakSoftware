#if os(iOS)
    import Supabase
    import SundeckCore
    import SundeckSync
    import SwiftUI

    // Sign in, create an account, the two-step code, first setup, and signing in again (spec
    // 5.13; website app/(public)/sign-in and components/auth-card.tsx). No tab bar: the grouped
    // gray page with the Sundeck Pro mark, a large title, and grouped fields. Same wording as the
    // Expo app's screens.

    /// The Sundeck Pro mark (brand/logo/sundeck-mark.svg, drawn here so it stays sharp), in `water`.
    struct SundeckMark: Shape {
        static let box = CGSize(width: 100, height: 146.3)
        static let d = [
            "M49.98 1.39 C50.23 -7.52 48.1 -16.48 43.58 -24.52 C34.72 -40.26 18.06 -50 0 -50 C-18.06 -50",
            "-34.72 -40.26 -43.58 -24.52 C-48.1 -16.48 -50.23 -7.52 -49.98 1.39 C-49.76 1.3 -49.53 1.21 -49.3",
            "1.12 C-48.68 0.86 -48.05 0.58 -47.4 0.29 C-46.76 0 -46.11 -0.31 -45.45 -0.62 C-44.79 -0.93",
            "-44.12 -1.25 -43.45 -1.57 C-42.77 -1.88 -42.08 -2.21 -41.38 -2.52 C-40.69 -2.82 -39.98 -3.13",
            "-39.27 -3.42 C-38.55 -3.7 -37.83 -3.98 -37.09 -4.22 C-36.36 -4.47 -35.61 -4.7 -34.86 -4.9",
            "C-34.11 -5.09 -33.35 -5.26 -32.58 -5.39 C-31.81 -5.53 -31.03 -5.63 -30.26 -5.68 C-29.48 -5.74",
            "-28.69 -5.76 -27.91 -5.74 C-27.12 -5.72 -26.33 -5.66 -25.55 -5.55 C-24.77 -5.45 -23.99 -5.3",
            "-23.23 -5.12 C-22.46 -4.95 -21.7 -4.73 -20.96 -4.49 C-20.21 -4.25 -19.48 -3.98 -18.75 -3.7",
            "C-18.03 -3.41 -17.31 -3.1 -16.61 -2.79 C-15.9 -2.48 -15.21 -2.14 -14.53 -1.82 C-13.84 -1.49",
            "-13.17 -1.15 -12.5 -0.83 C-11.84 -0.51 -11.18 -0.18 -10.54 0.12 C-9.9 0.43 -9.26 0.72 -8.64 0.99",
            "C-8.01 1.27 -7.4 1.52 -6.8 1.75 C-6.19 1.98 -5.6 2.18 -5.02 2.36 C-4.44 2.53 -3.87 2.68 -3.3 2.8",
            "C-2.74 2.91 -2.19 3 -1.64 3.06 C-1.09 3.12 -0.55 3.15 0 3.15 C0.55 3.15 1.09 3.12 1.64 3.06",
            "C2.19 3 2.74 2.91 3.3 2.8 C3.87 2.68 4.44 2.53 5.02 2.36 C5.6 2.18 6.19 1.98 6.8 1.75 C7.4 1.52",
            "8.01 1.27 8.64 0.99 C9.26 0.72 9.9 0.43 10.54 0.12 C11.18 -0.18 11.84 -0.51 12.5 -0.83 C13.17",
            "-1.15 13.84 -1.49 14.53 -1.82 C15.21 -2.14 15.9 -2.48 16.61 -2.79 C17.31 -3.1 18.03 -3.41 18.75",
            "-3.7 C19.48 -3.98 20.21 -4.25 20.96 -4.49 C21.7 -4.73 22.46 -4.95 23.23 -5.12 C23.99 -5.3 24.77",
            "-5.45 25.55 -5.55 C26.33 -5.66 27.12 -5.72 27.91 -5.74 C28.69 -5.76 29.48 -5.74 30.26 -5.68",
            "C31.03 -5.63 31.81 -5.53 32.58 -5.39 C33.35 -5.26 34.11 -5.09 34.86 -4.9 C35.61 -4.7 36.36 -4.47",
            "37.09 -4.22 C37.83 -3.98 38.55 -3.7 39.27 -3.42 C39.98 -3.13 40.69 -2.82 41.38 -2.52 C42.08",
            "-2.21 42.77 -1.88 43.45 -1.57 C44.12 -1.25 44.79 -0.93 45.45 -0.62 C46.11 -0.31 46.76 0 47.4",
            "0.29 C48.05 0.58 48.68 0.86 49.3 1.12 C49.53 1.21 49.76 1.3 49.98 1.39 Z M-49.29 8.38 C-49.15",
            "8.33 -49 8.28 -48.86 8.23 C-48.13 7.97 -47.41 7.69 -46.7 7.4 C-45.99 7.11 -45.29 6.79 -44.6 6.48",
            "C-43.9 6.17 -43.22 5.84 -42.55 5.53 C-41.87 5.21 -41.21 4.89 -40.55 4.59 C-39.9 4.28 -39.25 3.98",
            "-38.62 3.7 C-37.98 3.41 -37.35 3.14 -36.73 2.89 C-36.11 2.65 -35.51 2.42 -34.91 2.22 C-34.31",
            "2.01 -33.72 1.83 -33.14 1.68 C-32.56 1.53 -31.99 1.4 -31.42 1.31 C-30.86 1.21 -30.3 1.14 -29.74",
            "1.1 C-29.19 1.06 -28.64 1.04 -28.09 1.06 C-27.54 1.07 -27 1.11 -26.45 1.19 C-25.9 1.26 -25.34",
            "1.37 -24.77 1.5 C-24.21 1.63 -23.63 1.79 -23.04 1.98 C-22.46 2.17 -21.86 2.39 -21.25 2.63",
            "C-20.64 2.87 -20.02 3.13 -19.39 3.41 C-18.76 3.69 -18.12 4 -17.47 4.31 C-16.83 4.62 -16.17 4.95",
            "-15.5 5.28 C-14.83 5.6 -14.15 5.94 -13.46 6.26 C-12.77 6.59 -12.07 6.92 -11.36 7.22 C-10.65 7.53",
            "-9.93 7.83 -9.2 8.11 C-8.47 8.38 -7.73 8.64 -6.98 8.87 C-6.23 9.09 -5.47 9.29 -4.7 9.45 C-3.93",
            "9.61 -3.15 9.74 -2.36 9.82 C-1.58 9.91 -0.79 9.95 0 9.95 C0.79 9.95 1.58 9.91 2.36 9.82 C3.15",
            "9.74 3.93 9.61 4.7 9.45 C5.47 9.29 6.23 9.09 6.98 8.87 C7.73 8.64 8.47 8.38 9.2 8.11 C9.93 7.83",
            "10.65 7.53 11.36 7.22 C12.07 6.92 12.77 6.59 13.46 6.26 C14.15 5.94 14.83 5.6 15.5 5.28 C16.17",
            "4.95 16.83 4.62 17.47 4.31 C18.12 4 18.76 3.69 19.39 3.41 C20.02 3.13 20.64 2.87 21.25 2.63",
            "C21.86 2.39 22.46 2.17 23.04 1.98 C23.63 1.79 24.21 1.63 24.77 1.5 C25.34 1.37 25.9 1.26 26.45",
            "1.19 C27 1.11 27.54 1.07 28.09 1.06 C28.64 1.04 29.19 1.06 29.74 1.1 C30.3 1.14 30.86 1.21 31.42",
            "1.31 C31.99 1.4 32.56 1.53 33.14 1.68 C33.72 1.83 34.31 2.01 34.91 2.22 C35.51 2.42 36.11 2.65",
            "36.73 2.89 C37.35 3.14 37.98 3.41 38.62 3.7 C39.25 3.98 39.9 4.28 40.55 4.59 C41.21 4.89 41.87",
            "5.21 42.55 5.53 C43.22 5.84 43.9 6.17 44.6 6.48 C45.29 6.79 45.99 7.11 46.7 7.4 C47.41 7.69",
            "48.13 7.97 48.86 8.23 C49 8.28 49.15 8.33 49.29 8.38 C48.91 10.63 48.38 12.84 47.69 15.01 C47.6",
            "14.97 47.5 14.93 47.4 14.89 C46.76 14.6 46.11 14.29 45.45 13.98 C44.79 13.67 44.12 13.35 43.45",
            "13.03 C42.77 12.72 42.08 12.39 41.38 12.08 C40.69 11.78 39.98 11.47 39.27 11.18 C38.55 10.9",
            "37.83 10.62 37.09 10.38 C36.36 10.13 35.61 9.9 34.86 9.7 C34.11 9.51 33.35 9.34 32.58 9.21",
            "C31.81 9.07 31.03 8.97 30.26 8.92 C29.48 8.86 28.69 8.84 27.91 8.86 C27.12 8.88 26.33 8.94 25.55",
            "9.05 C24.77 9.15 23.99 9.3 23.23 9.48 C22.46 9.65 21.7 9.87 20.96 10.11 C20.21 10.35 19.48 10.62",
            "18.75 10.9 C18.03 11.19 17.31 11.5 16.61 11.81 C15.9 12.12 15.21 12.46 14.53 12.78 C13.84 13.11",
            "13.17 13.45 12.5 13.77 C11.84 14.09 11.18 14.42 10.54 14.72 C9.9 15.03 9.26 15.32 8.64 15.59",
            "C8.01 15.87 7.4 16.12 6.8 16.35 C6.19 16.58 5.6 16.78 5.02 16.96 C4.44 17.13 3.87 17.28 3.3 17.4",
            "C2.74 17.51 2.19 17.6 1.64 17.66 C1.09 17.72 0.55 17.75 0 17.75 C-0.55 17.75 -1.09 17.72 -1.64",
            "17.66 C-2.19 17.6 -2.74 17.51 -3.3 17.4 C-3.87 17.28 -4.44 17.13 -5.02 16.96 C-5.6 16.78 -6.19",
            "16.58 -6.8 16.35 C-7.4 16.12 -8.01 15.87 -8.64 15.59 C-9.26 15.32 -9.9 15.03 -10.54 14.72",
            "C-11.18 14.42 -11.84 14.09 -12.5 13.77 C-13.17 13.45 -13.84 13.11 -14.53 12.78 C-15.21 12.46",
            "-15.9 12.12 -16.61 11.81 C-17.31 11.5 -18.03 11.19 -18.75 10.9 C-19.48 10.62 -20.21 10.35 -20.96",
            "10.11 C-21.7 9.87 -22.46 9.65 -23.23 9.48 C-23.99 9.3 -24.77 9.15 -25.55 9.05 C-26.33 8.94",
            "-27.12 8.88 -27.91 8.86 C-28.69 8.84 -29.48 8.86 -30.26 8.92 C-31.03 8.97 -31.81 9.07 -32.58",
            "9.21 C-33.35 9.34 -34.11 9.51 -34.86 9.7 C-35.61 9.9 -36.36 10.13 -37.09 10.38 C-37.83 10.62",
            "-38.55 10.9 -39.27 11.18 C-39.98 11.47 -40.69 11.78 -41.38 12.08 C-42.08 12.39 -42.77 12.72",
            "-43.45 13.03 C-44.12 13.35 -44.79 13.67 -45.45 13.98 C-46.11 14.29 -46.76 14.6 -47.4 14.89",
            "C-47.5 14.93 -47.6 14.97 -47.69 15.02 C-48.38 12.84 -48.91 10.63 -49.29 8.39 Z M-45.21 21.36",
            "C-45 21.26 -44.8 21.17 -44.6 21.08 C-43.9 20.77 -43.22 20.44 -42.55 20.13 C-41.87 19.81 -41.21",
            "19.49 -40.55 19.19 C-39.9 18.88 -39.25 18.58 -38.62 18.3 C-37.98 18.01 -37.35 17.74 -36.73 17.49",
            "C-36.11 17.25 -35.51 17.02 -34.91 16.82 C-34.31 16.61 -33.72 16.43 -33.14 16.28 C-32.56 16.13",
            "-31.99 16 -31.42 15.91 C-30.86 15.81 -30.3 15.74 -29.74 15.7 C-29.19 15.66 -28.64 15.64 -28.09",
            "15.66 C-27.54 15.67 -27 15.71 -26.45 15.79 C-25.9 15.86 -25.34 15.97 -24.77 16.1 C-24.21 16.23",
            "-23.63 16.39 -23.04 16.58 C-22.46 16.77 -21.86 16.99 -21.25 17.23 C-20.64 17.47 -20.02 17.73",
            "-19.39 18.01 C-18.76 18.29 -18.12 18.6 -17.47 18.91 C-16.83 19.22 -16.17 19.55 -15.5 19.88",
            "C-14.83 20.2 -14.15 20.54 -13.46 20.86 C-12.77 21.19 -12.07 21.52 -11.36 21.82 C-10.65 22.13",
            "-9.93 22.43 -9.2 22.71 C-8.47 22.98 -7.73 23.24 -6.98 23.47 C-6.23 23.69 -5.47 23.89 -4.7 24.05",
            "C-3.93 24.21 -3.15 24.34 -2.36 24.42 C-1.58 24.51 -0.79 24.55 0 24.55 C0.79 24.55 1.58 24.51",
            "2.36 24.42 C3.15 24.34 3.93 24.21 4.7 24.05 C5.47 23.89 6.23 23.69 6.98 23.47 C7.73 23.24 8.47",
            "22.98 9.2 22.71 C9.93 22.43 10.65 22.13 11.36 21.82 C12.07 21.52 12.77 21.19 13.46 20.86 C14.15",
            "20.54 14.83 20.2 15.5 19.88 C16.17 19.55 16.83 19.22 17.47 18.91 C18.12 18.6 18.76 18.29 19.39",
            "18.01 C20.02 17.73 20.64 17.47 21.25 17.23 C21.86 16.99 22.46 16.77 23.04 16.58 C23.63 16.39",
            "24.21 16.23 24.77 16.1 C25.34 15.97 25.9 15.86 26.45 15.79 C27 15.71 27.54 15.67 28.09 15.66",
            "C28.64 15.64 29.19 15.66 29.74 15.7 C30.3 15.74 30.86 15.81 31.42 15.91 C31.99 16 32.56 16.13",
            "33.14 16.28 C33.72 16.43 34.31 16.61 34.91 16.82 C35.51 17.02 36.11 17.25 36.73 17.49 C37.35",
            "17.74 37.98 18.01 38.62 18.3 C39.25 18.58 39.9 18.88 40.55 19.19 C41.21 19.49 41.87 19.81 42.55",
            "20.13 C43.22 20.44 43.9 20.77 44.6 21.08 C44.8 21.17 45 21.26 45.21 21.36 C44.47 22.93 43.64",
            "24.46 42.73 25.96 C28.49 49.41 14.24 72.85 0 96.3 C-14.24 72.85 -28.49 49.41 -42.73 25.96",
            "C-43.64 24.46 -44.47 22.93 -45.21 21.37 Z M-13.2 -20.8 a13.2 13.2 0 1 0 26.4 0 a13.2 13.2 0 1 0",
            "-26.4 0 Z",
        ].joined(separator: " ")
        nonisolated(unsafe) private static let cg = cgPath(svg: d)

        func path(in rect: CGRect) -> Path {
            let scale = min(rect.width / Self.box.width, rect.height / Self.box.height)
            let transform = CGAffineTransform(translationX: rect.minX, y: rect.minY)
                .scaledBy(x: scale, y: scale)
                .translatedBy(x: 50, y: 50)
            return Path(Self.cg).applying(transform)
        }
    }

    /// The frame every sign-in screen shares: the mark 32 from the top, the large title, an
    /// optional intro, then the form 24 below.
    struct AuthFrame<Intro: View, Content: View>: View {
        var title: String
        @ViewBuilder var intro: Intro
        @ViewBuilder var content: Content

        var body: some View {
            ScrollView {
                VStack(spacing: 0) {
                    SundeckMark()
                        .fill(Color.water, style: FillStyle(eoFill: true))
                        .frame(width: 48, height: 70)
                        .padding(.top, 32)
                        .accessibilityLabel("Sundeck Pro")
                    Text(title)
                        .textRole(.largeTitle)
                        .foregroundStyle(Color.text)
                        .multilineTextAlignment(.center)
                        .padding(.top, 16)
                        .accessibilityAddTraits(.isHeader)
                    intro
                        .textRole(.body)
                        .foregroundStyle(Color.textMuted)
                        .multilineTextAlignment(.center)
                        .padding(.top, 4)
                    VStack(alignment: .leading, spacing: 16) { content }
                        .padding(.top, 24)
                }
                .frame(maxWidth: 440)
                .padding(.horizontal, CGFloat(Spacing.pageMargin))
                .padding(.bottom, 32)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.bg)
            .toolbar(.hidden, for: .tabBar)
        }
    }

    extension AuthFrame where Intro == EmptyView {
        init(title: String, @ViewBuilder content: () -> Content) {
            self.title = title
            intro = EmptyView()
            self.content = content()
        }
    }

    /// A password row of a grouped form, with an eye button to show or hide what's typed and,
    /// for a new password, the rules as a checklist with a bar (owner, 2026-10-24; as on the
    /// website and Android: packages/core/src/password.ts, Password.swift).
    struct SecureFieldRow: View {
        var label: String
        @Binding var text: String
        var contentType: UITextContentType = .password
        var labelWidth: CGFloat = 96
        /// A new password: show the rules as they're met.
        var meter = false
        @State private var shown = false

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 12) {
                    Text(label).textRole(.body).foregroundStyle(Color.text).frame(
                        width: labelWidth, alignment: .leading)
                    Group {
                        if shown {
                            TextField("", text: $text, prompt: Text("Required").foregroundStyle(Color.placeholder))
                        } else {
                            SecureField("", text: $text, prompt: Text("Required").foregroundStyle(Color.placeholder))
                        }
                    }
                    .textRole(.body)
                    .foregroundStyle(Color.text)
                    .textContentType(contentType)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .accessibilityLabel(label)
                    Button {
                        shown.toggle()
                    } label: {
                        Image(systemName: shown ? "eye.slash" : "eye")
                            .foregroundStyle(Color.textMuted)
                            .frame(width: minTarget, height: minTarget)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(shown ? "Hide password" : "Show password")
                    .accessibilityAddTraits(shown ? .isSelected : [])
                }
                if meter { PasswordMeter(password: text) }
            }
            .padding(.leading, CGFloat(Spacing.rowHorizontal))
            .padding(.trailing, CGFloat(Spacing.rowHorizontal) - 10)
            .padding(.vertical, CGFloat(Spacing.rowVertical))
            .frame(minHeight: minTarget)
        }
    }

    /// The password rules as a checklist with a bar: quiet gray until each is met.
    struct PasswordMeter: View {
        var password: String

        var body: some View {
            let checks = passwordChecks(password)
            let score = passwordScore(password)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    ForEach(passwordRules.indices, id: \.self) { i in
                        Capsule()
                            .fill(
                                i < score
                                    ? (score == passwordRules.count ? Color.pass : Color.brandPrimary) : Color.separator
                            )
                            .frame(height: 4)
                    }
                }
                .padding(.bottom, 6)
                .accessibilityElement()
                .accessibilityLabel("Password strength")
                .accessibilityValue("\(score) of \(passwordRules.count) rules met")
                ForEach(passwordRules, id: \.id) { rule in
                    let met = checks[rule.id] == true
                    HStack(spacing: 8) {
                        Text(met ? "✓" : "○").foregroundStyle(met ? Color.pass : Color.textMuted)
                        Text(rule.label).foregroundStyle(met ? Color.text : Color.textMuted)
                    }
                    .textRole(.secondary)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(rule.label), \(met ? "met" : "not yet")")
                }
            }
            .padding(.trailing, 10)
            .padding(.bottom, 4)
        }
    }

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
        @State private var browser: BrowserPage?

        /// "New to Sundeck Pro? Start a free trial." opened the website's sign-up, whose trial
        /// takes a card: a call to action to buy outside the app, which App Review's 3.1.1 and
        /// 3.1.3(f) don't allow (docs/release/APP_STORE.md, "App Review risks"). Off for the App
        /// Store; set true to bring the link back. Create an Account (free) stays.
        static let offersTrialLink = false

        var body: some View {
            AuthFrame(title: "Sign In") {
                if Self.offersTrialLink {
                    InlineLinkText(text: "New to Sundeck Pro?", link: "Start a free trial.") {
                        browser = .site("sign-up")
                    }
                }
            } content: {
                // The server ended this phone's sign-in (owner, 2026-10-22); its work waits here.
                if let notice = session.signedOutNotice {
                    Notice(
                        kind: .warning, text: [notice.message, notice.note].compactMap { $0 }.joined(separator: " "))
                }
                Grouped {
                    LabeledFieldRow(
                        label: "Email", text: $email, placeholder: "name@example.com", keyboard: .emailAddress,
                        labelWidth: 96, contentType: .username
                    )
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    SecureFieldRow(label: "Password", text: $password)
                        .submitLabel(.go)
                        .onSubmit { Task { await signIn() } }
                }
                if let error { Notice(kind: .error, text: error) }
                Button {
                    Task { await signIn() }
                } label: {
                    BusyButtonLabel("Sign In", busy: busy, busyTitle: "Signing In…")
                }
                .buttonStyle(.primary(fullWidth: true, size: .field))
                .disabled(busy)
                NavigationLink("Forgot Password?") { ForgotPasswordView(email: email) }
                    .buttonStyle(.quiet)
                    .frame(maxWidth: .infinity)
                NavigationLink("Create an Account") { SignUpView() }
                    .buttonStyle(.quiet)
                    .frame(maxWidth: .infinity)
                #if DEBUG
                    Notice(
                        kind: .info,
                        text:
                            "Demo accounts (dev only): tech@demo.leakbook.test or owner@demo.leakbook.test, password leakbook-demo"
                    )
                #endif
            }
            .toolbar(.hidden, for: .navigationBar)
            .browserSheet($browser)
            .onAppear { if email.isEmpty, let signedOut = session.signedOutUser { email = signedOut.email } }
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

    /// Forgot Password? (owner, 2026-10-22): the website's Reset Password page. The email's link
    /// opens the website to choose the new password; then they sign in here with it.
    struct ForgotPasswordView: View {
        @Environment(\.dismiss) private var dismiss
        @State private var form: PasswordResetForm

        init(email: String) { _form = State(initialValue: PasswordResetForm(email: email)) }

        var body: some View {
            AuthFrame(title: PasswordResetForm.title) {
                Text(PasswordResetForm.intro)
            } content: {
                Grouped {
                    LabeledFieldRow(
                        label: "Email", text: $form.email, placeholder: "name@example.com", keyboard: .emailAddress,
                        labelWidth: 96, contentType: .username
                    )
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.send)
                    .onSubmit { Task { await send() } }
                }
                if let error = form.error { Notice(kind: .error, text: error) }
                if let sent = form.sent { Notice(kind: .success, text: sent) }
                Button {
                    Task { await send() }
                } label: {
                    BusyButtonLabel("Email Me a Reset Link", busy: form.sending, busyTitle: "Sending…")
                }
                .buttonStyle(.primary(fullWidth: true, size: .field))
                .disabled(form.sending)
                Button(PasswordResetForm.back) { dismiss() }
                    .buttonStyle(.quiet)
                    .frame(maxWidth: .infinity)
            }
            .navigationBarTitleDisplayMode(.inline)
        }

        private func send() async {
            await form.send(WebAPI(baseURL: AppConfig.webURL) { nil })
        }
    }

    struct SignUpView: View {
        @Environment(Session.self) private var session
        @Environment(\.dismiss) private var dismiss
        @State private var name = ""
        @State private var email = ""
        @State private var password = ""
        @State private var heardFrom = ""
        @State private var heardFromOther = ""
        @State private var error: String?
        @State private var confirmEmail = false
        @State private var busy = false

        var body: some View {
            AuthFrame(title: "Create an Account") {
                Text("If your company already uses Sundeck Pro, ask the owner to invite this email, then sign up here.")
            } content: {
                Grouped {
                    LabeledFieldRow(
                        label: "Name", text: $name, placeholder: "Required", labelWidth: 96, contentType: .name)
                    LabeledFieldRow(
                        label: "Email", text: $email, placeholder: "name@example.com", keyboard: .emailAddress,
                        labelWidth: 96, contentType: .username
                    )
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    SecureFieldRow(label: "Password", text: $password, contentType: .newPassword, meter: true)
                }
                HeardFromRows(key: $heardFrom, other: $heardFromOther)
                if let error { Notice(kind: .error, text: error) }
                if confirmEmail {
                    Notice(
                        kind: .info, text: "Check your email and tap the link to confirm your account, then sign in.")
                }
                Button {
                    Task { await signUp() }
                } label: {
                    BusyButtonLabel("Create Account", busy: busy, busyTitle: "Creating Account…")
                }
                .buttonStyle(.primary(fullWidth: true, size: .field))
                .disabled(busy)
                Button("I Already Have an Account") { dismiss() }
                    .buttonStyle(.quiet)
                    .frame(maxWidth: .infinity)
            }
            .navigationBarTitleDisplayMode(.inline)
        }

        private func signUp() async {
            guard !name.trimmingCharacters(in: .whitespaces).isEmpty, !email.isEmpty else {
                error = "Enter your name and email."
                return
            }
            if let problem = passwordProblem(password) {
                error = problem
                return
            }
            busy = true
            defer { busy = false }
            do {
                let signedIn = try await session.signUp(
                    name: name, email: email, password: password, heardFrom: heardFrom, heardFromOther: heardFromOther)
                confirmEmail = !signedIn
                error = nil
            } catch {
                self.error = String(describing: error)
            }
        }
    }

    /// "How did you hear about us?" (owner, 2026-10-24), as on the website's sign-up: optional,
    /// the question with the chosen answer under it opening the system menu, and "Other" opens a
    /// short text field. Empty `key`: not answered.
    struct HeardFromRows: View {
        @Binding var key: String
        @Binding var other: String

        private func label(_ key: String) -> String {
            heardFromOptions.first { $0.key == key }?.label ?? heardFromNone
        }

        var body: some View {
            Grouped {
                Menu {
                    Picker(heardFromQuestion, selection: $key) {
                        Text(heardFromNone).tag("")
                        ForEach(heardFromOptions, id: \.key) { Text($0.label).tag($0.key) }
                    }
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(heardFromQuestion).textRole(.body).foregroundStyle(Color.text)
                        HStack(spacing: 6) {
                            Text(label(key)).textRole(.body).foregroundStyle(Color.link)
                            Image(systemName: "chevron.up.chevron.down").font(.footnote).foregroundStyle(Color.link)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                    .padding(.vertical, CGFloat(Spacing.rowVertical))
                    .frame(minHeight: minTarget)
                    .contentShape(Rectangle())
                }
                .accessibilityLabel(heardFromQuestion)
                .accessibilityValue(label(key))
                if key == "other" {
                    TextField(
                        "", text: $other, prompt: Text(heardFromOtherPlaceholder).foregroundStyle(Color.placeholder)
                    )
                    .textRole(.body)
                    .foregroundStyle(Color.text)
                    .onChange(of: other) { _, new in
                        if new.count > heardFromOtherMax { other = String(new.prefix(heardFromOtherMax)) }
                    }
                    .accessibilityLabel("Where you heard about us")
                    .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                    .padding(.vertical, CGFloat(Spacing.rowVertical))
                    .frame(minHeight: minTarget)
                }
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
                AuthFrame(title: "Enter Your Code") {
                    Text("Open your authenticator app and enter the 6-digit code for Sundeck Pro.")
                } content: {
                    Grouped {
                        LabeledFieldRow(
                            label: "Code", text: $code, placeholder: "123456", keyboard: .numberPad, labelWidth: 96,
                            contentType: .oneTimeCode
                        )
                        .onChange(of: code) { _, new in if new.count > 7 { code = String(new.prefix(7)) } }
                    }
                    if let error { Notice(kind: .error, text: error) }
                    if sync.status.pending > 0 {
                        Notice(
                            kind: .warning,
                            text:
                                "This phone has \(changeCount(sync.status.pending)) waiting to send. Enter your code to send them; signing out would lose them."
                        )
                    }
                    Button {
                        Task { await verify() }
                    } label: {
                        BusyButtonLabel("Continue", busy: busy, busyTitle: "Checking…")
                    }
                    .buttonStyle(.primary(fullWidth: true, size: .field))
                    .disabled(busy)
                    Button("Sign Out") { Task { await session.cancelCode() } }
                        .buttonStyle(.quiet)
                        .frame(maxWidth: .infinity)
                }
                .toolbar(.hidden, for: .navigationBar)
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
                AuthFrame(title: sync.status.initialSyncDone ? "Welcome to Sundeck Pro" : "Getting Ready") {
                    if sync.status.initialSyncDone {
                        Text("Signed in as \(session.user?.email ?? "")")
                    }
                } content: {
                    if !sync.status.initialSyncDone { downloading } else { joinTeam }
                    Button("Sign Out") { Task { await session.signOut() } }
                        .buttonStyle(.quiet)
                        .frame(maxWidth: .infinity)
                }
                .toolbar(.hidden, for: .navigationBar)
            }
        }

        @ViewBuilder private var downloading: some View {
            if sync.status.phase == .offline {
                Notice(
                    kind: .warning,
                    text:
                        "Connect to the internet once so this phone can download your company. After that, it works without signal."
                )
            } else {
                // A pool that fills to the real progress (owner, 2026-10-20; gestures section 11).
                DownloadProgressView(download: sync.status.download)
            }
            if let message = sync.status.error { Notice(kind: .error, text: message) }
            Button("Try Again") { Task { await sync.syncNow() } }
                .buttonStyle(.secondary(fullWidth: true, size: .field))
        }

        @ViewBuilder private var joinTeam: some View {
            if let error { Notice(kind: .error, text: error) }
            Grouped(
                label: "Join your team",
                footer: "Use the invite code your owner sent to \(session.user?.email ?? "your email")."
            ) {
                LabeledFieldRow(label: "Invite code", text: $invite, placeholder: "From your email", labelWidth: 112)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.join)
                    .onSubmit { Task { await join() } }
            }
            Button {
                Task { await join() }
            } label: {
                BusyButtonLabel("Join", busy: joining, busyTitle: "Joining…")
            }
            .buttonStyle(.primary(fullWidth: true, size: .field))
            .disabled(joining)
            Grouped(label: "Starting a new shop?") {
                Text("The owner sets up the shop on the Sundeck Pro website, then signs in here with the same email.")
                    .textRole(.body)
                    .foregroundStyle(Color.text)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
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

    /// The owner of a shop whose setup isn't finished (owner, 2026-10-24: "shops should have to
    /// submit a credit card for the trial"). The website takes them to its trial page; the app only
    /// says to finish on the website: no link, button or price, since an iPhone app may not send
    /// people to an outside purchase (App Store rule 3.1.1). Port of apps/mobile/src/app/finish-setup.tsx.
    struct FinishSetupView: View {
        @Environment(Session.self) private var session
        @State private var message: String?
        @State private var checking = false

        var body: some View {
            NavigationStack {
                AuthFrame(title: finishSetupTitle) {
                    Text("Signed in as \(session.user?.email ?? "")")
                } content: {
                    Text(finishSetupBody)
                        .textRole(.body)
                        .foregroundStyle(Color.text)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                    if let message { Notice(kind: .warning, text: message) }
                    Button {
                        Task { await check() }
                    } label: {
                        BusyButtonLabel("Check Again", busy: checking, busyTitle: "Checking…")
                    }
                    .buttonStyle(.primary(fullWidth: true, size: .field))
                    .disabled(checking)
                    Button("Sign Out") { Task { await session.signOut() } }
                        .buttonStyle(.quiet)
                        .frame(maxWidth: .infinity)
                }
                .toolbar(.hidden, for: .navigationBar)
            }
        }

        private func check() async {
            message = nil
            checking = true
            defer { checking = false }
            // .done opens the app by itself (RootView follows session.route).
            switch await session.checkSetup() {
            case .needed: message = finishSetupStill
            case .offline: message = finishSetupOffline
            case .failed: message = finishSetupFailed
            case .done: break
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
                AuthFrame(title: "Sign In Again") {
                    Text("Signed in as \(session.user?.email ?? ""). Everything on this phone stays put.")
                } content: {
                    Grouped {
                        SecureFieldRow(label: "Password", text: $password)
                            .submitLabel(.go)
                            .onSubmit { Task { await signIn() } }
                    }
                    if let error { Notice(kind: .error, text: error) }
                    Button {
                        Task { await signIn() }
                    } label: {
                        BusyButtonLabel("Sign In", busy: busy, busyTitle: "Signing In…")
                    }
                    .buttonStyle(.primary(fullWidth: true, size: .field))
                    .disabled(busy || password.isEmpty)
                }
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                }
            }
            .sheetPresentation()
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
