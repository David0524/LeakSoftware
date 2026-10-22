#if os(iOS)
    import SafariServices
    import SundeckCore
    import SundeckTokens
    import SwiftUI

    // Small pieces the Messages and More screens share: the in-app browser for website pages,
    // and the share sheet for exported files.

    /// A website page to open in the in-app browser.
    struct BrowserPage: Identifiable, Hashable {
        var url: URL
        var id: URL { url }

        /// A page on the Sundeck Pro website ("privacy", "settings/phone").
        static func site(_ path: String) -> BrowserPage {
            BrowserPage(url: AppConfig.webURL.appendingPathComponent(path))
        }
    }

    /// `SFSafariViewController` (spec 8.1: help pages, Stripe onboarding, report links).
    struct SafariSheet: UIViewControllerRepresentable {
        var url: URL

        func makeUIViewController(context: Context) -> SFSafariViewController {
            let controller = SFSafariViewController(url: url)
            controller.preferredControlTintColor = UIColor(Tokens.Role.link)
            return controller
        }

        func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
    }

    extension View {
        /// Shows a website page in the in-app browser while `page` is set.
        func browserSheet(_ page: Binding<BrowserPage?>) -> some View {
            sheet(item: page) { SafariSheet(url: $0.url).ignoresSafeArea() }
        }
    }

    /// A file to hand to the share sheet (CSV exports).
    struct SharedFile: Identifiable {
        var url: URL
        var id: URL { url }
    }

    struct FileShareSheet: UIViewControllerRepresentable {
        var url: URL

        func makeUIViewController(context: Context) -> UIActivityViewController {
            UIActivityViewController(activityItems: [url], applicationActivities: nil)
        }

        func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
    }

    /// A sheet's frame (spec 3.15): Cancel on the left, the title in the middle, the form on the
    /// grouped gray. With unsaved changes, swipe-down is off and Cancel asks first.
    struct FormSheet<Content: View>: View {
        var title: String
        var dirty = false
        var cancelTitle = "Cancel"
        @ViewBuilder var content: Content
        @Environment(\.dismiss) private var dismiss
        @State private var confirm = false

        var body: some View {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) { content }
                        .padding(.horizontal, CGFloat(Spacing.pageMargin))
                        .padding(.top, 8)
                        .padding(.bottom, 24)
                }
                .background(Color.bg)
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(cancelTitle) { if dirty { confirm = true } else { dismiss() } }
                    }
                }
            }
            .sheetPresentation(dirty: dirty)
            .discardPrompt(dirty: dirty, isPresented: $confirm)
        }
    }

    /// A row of a grouped form (spec 3.14): the label at a fixed width on the left, the field
    /// filling the rest, no box.
    struct LabeledFieldRow: View {
        var label: String
        @Binding var text: String
        var placeholder = ""
        var keyboard: UIKeyboardType = .default
        var labelWidth: CGFloat = 104
        var multiline = false
        var contentType: UITextContentType?
        /// Told when the field gets or lets go of the keyboard (address suggestions).
        var onFocusChange: ((Bool) -> Void)? = nil
        @FocusState private var focused: Bool

        var body: some View {
            HStack(alignment: multiline ? .top : .center, spacing: 12) {
                Text(label)
                    .textRole(.body)
                    .foregroundStyle(Color.text)
                    .frame(width: labelWidth, alignment: .leading)
                TextField(
                    "", text: $text, prompt: Text(placeholder).foregroundStyle(Color.placeholder),
                    axis: multiline ? .vertical : .horizontal
                )
                .lineLimit(multiline ? 3...12 : 1...1)
                .textRole(.body)
                .foregroundStyle(Color.text)
                .keyboardType(keyboard)
                .textContentType(contentType)
                .focused($focused)
                // Phone numbers format as they're typed (owner, 2026-10-20).
                .phoneTyping($text, active: keyboard == .phonePad && focused)
                .onChange(of: focused) { _, now in onFocusChange?(now) }
                .accessibilityLabel(label)
            }
            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
            .padding(.vertical, CGFloat(Spacing.rowVertical))
            .frame(minHeight: minTarget)
        }
    }

    /// A choice in a grouped form: the label on the left, the value right-aligned in `textMuted`,
    /// opening the system menu.
    struct LabeledPickerRow<Value: Hashable>: View {
        var label: String
        @Binding var selection: Value
        var options: [Value]
        var optionLabel: (Value) -> String

        var body: some View {
            Menu {
                Picker(label, selection: $selection) {
                    ForEach(options, id: \.self) { Text(optionLabel($0)).tag($0) }
                }
            } label: {
                HStack(spacing: 12) {
                    Text(label).textRole(.body).foregroundStyle(Color.text)
                    Spacer(minLength: 8)
                    Text(optionLabel(selection)).textRole(.body).foregroundStyle(Color.textMuted)
                    Image(systemName: "chevron.up.chevron.down").font(.footnote).foregroundStyle(Color.textMuted)
                }
                .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                .padding(.vertical, CGFloat(Spacing.rowVertical))
                .frame(minHeight: minTarget)
                .contentShape(Rectangle())
            }
            .accessibilityLabel(label)
            .accessibilityValue(optionLabel(selection))
        }
    }

    /// Opens directions to a place in the app chosen under More › Directions open in.
    @MainActor
    func directionsURL(_ place: MapPlace, choice: DirectionsChoice) -> URL? {
        URL(string: nativeMapsUrl(place, choice == .google ? "web" : "ios"))
    }
#endif
