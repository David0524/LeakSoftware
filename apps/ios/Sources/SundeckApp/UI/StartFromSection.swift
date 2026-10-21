#if os(iOS)
    import SundeckCore
    import SwiftUI

    // Start My Day From (owner, 2026-10-21; docs/design/2026-10-21-start-from-home.md), in More ›
    // My Profile and on a person in Settings › Team: The Shop or Home as a segmented control
    // (two related states), Home's address with the same suggestions as a pool's, what happens
    // while it isn't on the map, and the footer. Words from core `START_FROM_COPY`.

    struct StartFromSection: View {
        @Binding var form: StartFromForm
        /// The saved row, for whether its map point still belongs to the address.
        var saved: MemberStart?
        var userId: String
        @State private var suggester = AddressSuggester()
        @State private var addressFocused = false

        var body: some View {
            let status = StartFromStatus(form, saved: saved, userId: userId)
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(StartFromCopy.field)
                Segmented(
                    selection: $form.from, options: [RouteStartLabel.shop, .home],
                    label: { $0 == .home ? StartFromCopy.home : StartFromCopy.shop }, title: StartFromCopy.field,
                    fillsWidth: true)
                if form.from == .home {
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
