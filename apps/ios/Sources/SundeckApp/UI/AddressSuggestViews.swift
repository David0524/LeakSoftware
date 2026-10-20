#if os(iOS)
    import SundeckCore
    import SwiftUI

    // Address suggestions under a street field (owner, 2026-10-20). Website
    // components/address-field.tsx: rows under the field on phones, each the street and
    // "City, ST ZIP".

    /// Up to 5 suggested addresses, as rows (in a `Grouped`, under the street field).
    struct AddressSuggestionRows: View {
        var suggester: AddressSuggester
        var onPick: (AddressSuggestion) -> Void

        var body: some View {
            ForEach(suggester.items, id: \.self) { s in
                Button {
                    onPick(suggester.pick(s))
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "mappin.and.ellipse")
                            .font(.system(size: 17))
                            .foregroundStyle(Color.link)
                            .frame(width: 22)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.line1).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                            if !s.cityLine.isEmpty {
                                Text(s.cityLine).textRole(.secondary).foregroundStyle(Color.textMuted)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.row)
                .accessibilityLabel(s.spoken)
                .accessibilityHint("Fills in the address")
            }
        }
    }

    /// Looks up suggestions for the street field's text while it has the keyboard, after a short
    /// pause; closes them when it lets go.
    private struct AddressLookup: ViewModifier {
        var suggester: AddressSuggester
        var text: String
        var focused: Bool
        @Environment(AppEnvironment.self) private var app
        @Environment(Session.self) private var session

        func body(content: Content) -> some View {
            content.task(id: focused ? text : nil) {
                guard focused, let company = session.company else {
                    suggester.close()
                    return
                }
                let api = app.api
                let companyId = company.id
                suggester.fetch = { q in await api.suggestAddresses(companyId: companyId, q) }
                await suggester.typed(text)
            }
        }
    }

    extension View {
        /// Suggests addresses for `text` (the street) into `suggester` while `focused`.
        func addressLookup(_ suggester: AddressSuggester, text: String, focused: Bool) -> some View {
            modifier(AddressLookup(suggester: suggester, text: text, focused: focused))
        }
    }
#endif
