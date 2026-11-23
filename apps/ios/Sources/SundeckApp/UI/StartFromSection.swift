#if os(iOS)
    import SundeckCore
    import SwiftUI

    // Start My Day From and End My Day At (owner, 2026-10-21 and 2026-11-23;
    // docs/design/2026-10-21-start-from-home.md), in More › My Profile and on a person in
    // Settings › Team: The Shop or Home as a segmented control for each (two related states),
    // Home's address (when either is Home) with the same suggestions as a pool's, what happens
    // while it isn't on the map, and the footer. Words from core `START_FROM_COPY`.

    struct StartFromSection: View {
        @Binding var form: StartFromForm
        /// The saved row, for whether its map point still belongs to the address.
        var saved: MemberStart?
        var userId: String
        /// Someone else's (Team › their profile): the labels without "My".
        var others = false
        @State private var suggester = AddressSuggester()
        @State private var addressFocused = false

        var body: some View {
            let status = StartFromStatus(form, saved: saved, userId: userId)
            let field = others ? StartFromCopy.othersField : StartFromCopy.field
            let endField = others ? StartFromCopy.othersEndField : StartFromCopy.endField
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(field)
                Segmented(
                    selection: $form.from, options: [RouteStartLabel.shop, .home],
                    label: { $0 == .home ? StartFromCopy.home : StartFromCopy.shop }, title: field,
                    fillsWidth: true)
                SectionLabel(endField)
                    .padding(.top, 8)
                Segmented(
                    selection: $form.to, options: [RouteStartLabel.shop, .home],
                    label: { $0 == .home ? StartFromCopy.home : StartFromCopy.shop }, title: endField,
                    fillsWidth: true)
                if form.usesHomeAddress {
                    Grouped {
                        LabeledFieldRow(
                            label: StartFromCopy.homeAddress, text: $form.address, labelWidth: 132,
                            contentType: .fullStreetAddress, onFocusChange: { addressFocused = $0 }
                        )
                        .addressLookup(suggester, text: form.address, focused: addressFocused)
                        AddressSuggestionRows(suggester: suggester) { s in
                            form.address = [s.line1, s.cityLine].filter { !$0.isEmpty }.joined(separator: ", ")
                        }
                        if status.notOnMap { NotOnMapRow(detail: StartFromCopy.pending) }
                    }
                    .padding(.top, 4)
                }
                if let pending = status.pending, !status.notOnMap {
                    Text(pending).textRole(.footnote).foregroundStyle(Color.textMuted)
                        .padding(.horizontal, 16)
                }
                Text(StartFromCopy.footer).textRole(.footnote).foregroundStyle(Color.textMuted)
                    .padding(.horizontal, 16)
            }
        }
    }
#endif
