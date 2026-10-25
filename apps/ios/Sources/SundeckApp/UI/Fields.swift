#if os(iOS)
    import SwiftUI

    // Fields, selects, switches, search, checks and dates (spec 3.14).
    //
    //     OutlinedField(label: "Detection fee", text: $fee, unit: "$", keyboard: .decimalPad)
    //     SelectField(label: "Severity", selection: $severity, options: severities, optionLabel: \.name)
    //     SearchField(text: $query, placeholder: "Customer name or job number")
    //     SwitchRow("Text the customer", isOn: $text)
    //     RoundCheck(done: item.done)

    private struct FieldBox: ViewModifier {
        var error: Bool
        var focused: Bool
        var minHeight: CGFloat

        func body(content: Content) -> some View {
            let shape = RoundedRectangle(cornerRadius: CGFloat(Radius.field), style: .continuous)
            content
                .textRole(.body)
                .foregroundStyle(Color.text)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, minHeight: minHeight, alignment: .leading)
                .background(shape.fill(Color.surface))
                .overlay(shape.strokeBorder(error ? Color.fail : Color.controlBorder, lineWidth: 1))
                .overlay {
                    // A 3 pt focus ring outside the box, 1 pt from it.
                    if focused {
                        RoundedRectangle(cornerRadius: CGFloat(Radius.field) + 4, style: .continuous)
                            .strokeBorder(Color.focus, lineWidth: 3)
                            .padding(-4)
                    }
                }
                // A drag in a field moves the cursor, never the page (owner, 2026-10-20).
                .keepsHorizontalDrags()
        }
    }

    extension View {
        /// The outlined box of a field (radius 10, 1 pt `controlBorder`, `surface`): for custom
        /// field content. `fail` border with an error; the focus ring while focused.
        func fieldBox(error: Bool = false, focused: Bool = false, minHeight: CGFloat = minTarget) -> some View {
            modifier(FieldBox(error: error, focused: focused, minHeight: minHeight))
        }
    }

    /// A field's label above it (body medium, `text`); "(optional)" is part of the text.
    struct FieldLabel: View {
        var text: String

        init(_ text: String) { self.text = text }

        var body: some View {
            Text(text).textRole(.bodyMedium).foregroundStyle(Color.text)
        }
    }

    /// The hint or error under a field.
    struct FieldHint: View {
        var text: String
        var error = false

        var body: some View {
            Text(text).textRole(.secondary).foregroundStyle(error ? Color.fail : Color.textMuted)
        }
    }

    /// An outlined text field with its label, an optional unit inside at the right ("gal"), and
    /// a hint or error under it. `multiline` makes it a text area (at least 96 tall, growing).
    struct OutlinedField: View {
        var label: String
        @Binding var text: String
        var placeholder = ""
        var hint: String?
        var error: String?
        var unit: String?
        var keyboard: UIKeyboardType = .default
        var multiline = false
        /// Tabular and right-aligned (short money and number fields).
        var numeric = false
        /// The form's shared focus and this field's key in it, so the keyboard bar's Previous and
        /// Next move between fields (`.keyboardBar`, owner 2026-10-20). nil: the field's own.
        var chain: FocusState<String?>.Binding? = nil
        var chainKey: String? = nil
        /// Told when the field gets or lets go of the keyboard (address suggestions).
        var onFocusChange: ((Bool) -> Void)? = nil
        @FocusState private var focused: Bool

        private var isFocused: Bool {
            if let chain, let chainKey { return chain.wrappedValue == chainKey }
            return focused
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                FieldLabel(label)
                HStack(spacing: 8) {
                    TextField(
                        "", text: $text,
                        prompt: Text(placeholder).foregroundStyle(Color.placeholder),
                        axis: multiline ? .vertical : .horizontal
                    )
                    .lineLimit(multiline ? 3...100 : 1...1)
                    .keyboardType(keyboard)
                    .multilineTextAlignment(numeric ? .trailing : .leading)
                    .monospacedDigit()
                    .modifier(ChainFocus(chain: chain, key: chainKey, own: $focused))
                    .phoneTyping($text, active: keyboard == .phonePad && isFocused)
                    .onChange(of: isFocused) { _, now in onFocusChange?(now) }
                    .accessibilityLabel(label)
                    if let unit {
                        Text(unit).textRole(.secondary).foregroundStyle(Color.textMuted)
                    }
                }
                .frame(minHeight: multiline ? 80 : nil, alignment: .topLeading)
                .fieldBox(error: error != nil, focused: isFocused, minHeight: multiline ? 96 : minTarget)
                if let error {
                    FieldHint(text: error, error: true)
                } else if let hint {
                    FieldHint(text: hint)
                }
            }
        }
    }

    /// A phone field formats its number as it's typed (core `formatPhoneTyping`, owner
    /// 2026-10-20), only while it has the keyboard, so a saved number that's loaded in isn't
    /// changed. The value it sets itself is skipped, so it isn't formatted twice.
    private struct PhoneTyping: ViewModifier {
        @Binding var text: String
        var active: Bool
        @State private var set: String?

        func body(content: Content) -> some View {
            content.onChange(of: text) { old, new in
                if new == set {
                    set = nil
                    return
                }
                guard active else { return }
                let next = phoneTypingEdit(previous: old, raw: new)
                if next != new {
                    set = next
                    text = next
                }
            }
        }
    }

    extension View {
        func phoneTyping(_ text: Binding<String>, active: Bool) -> some View {
            modifier(PhoneTyping(text: text, active: active))
        }
    }

    /// A field focused by the form's shared focus when it has a key in it, else by its own.
    private struct ChainFocus: ViewModifier {
        var chain: FocusState<String?>.Binding?
        var key: String?
        var own: FocusState<Bool>.Binding

        func body(content: Content) -> some View {
            if let chain, let key {
                content.focused(chain, equals: key)
            } else {
                content.focused(own)
            }
        }
    }

    extension View {
        /// The bar over the keyboard on a form (owner, 2026-10-20): Previous and Next move
        /// through the fields in `order` (a number pad has no return key), Done puts the keyboard
        /// away. Attach once, on the form; give each field the same `focus` and its key.
        /// `onlyWhenFocused`: the bar shows only while one of these fields has the keyboard, for a
        /// part of a page whose other fields aren't in `order` (the visit's Chemicals card).
        func keyboardBar(_ focus: FocusState<String?>.Binding, order: [String], onlyWhenFocused: Bool = false)
            -> some View
        {
            modifier(KeyboardBar(focus: focus, order: order, onlyWhenFocused: onlyWhenFocused))
        }
    }

    private struct KeyboardBar: ViewModifier {
        var focus: FocusState<String?>.Binding
        var order: [String]
        var onlyWhenFocused = false

        func body(content: Content) -> some View {
            content.toolbar {
                if !onlyWhenFocused || focus.wrappedValue.map { order.contains($0) } == true {
                    ToolbarItemGroup(placement: .keyboard) {
                        Button(KeyboardBarText.previous) {
                            focus.wrappedValue = fieldStep(order, from: focus.wrappedValue, by: -1)
                        }
                        .disabled(fieldStep(order, from: focus.wrappedValue, by: -1) == nil)
                        Button(KeyboardBarText.next) {
                            focus.wrappedValue = fieldStep(order, from: focus.wrappedValue, by: 1)
                        }
                        .disabled(fieldStep(order, from: focus.wrappedValue, by: 1) == nil)
                        Spacer()
                        Button(KeyboardBarText.done) { focus.wrappedValue = nil }.fontWeight(.semibold)
                    }
                }
            }
        }
    }

    /// A choice that looks like an outlined field: the chosen value and an up-down chevron;
    /// tapping opens the system menu.
    struct SelectField<Value: Hashable>: View {
        var label: String?
        @Binding var selection: Value
        var options: [Value]
        var optionLabel: (Value) -> String

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                if let label { FieldLabel(label) }
                Menu {
                    Picker(label ?? "", selection: $selection) {
                        ForEach(options, id: \.self) { Text(optionLabel($0)).tag($0) }
                    }
                } label: {
                    HStack(spacing: 8) {
                        Text(optionLabel(selection)).foregroundStyle(Color.text)
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.footnote)
                            .foregroundStyle(Color.text)
                            .accessibilityHidden(true)
                    }
                    .fieldBox()
                }
                .accessibilityLabel(label ?? "")
                .accessibilityValue(optionLabel(selection))
            }
        }
    }

    /// The compact select in a settings row ("Directions open in"): the value in `link` in a small
    /// outlined box (radius 12).
    struct CompactSelect<Value: Hashable>: View {
        var title: String
        @Binding var selection: Value
        var options: [Value]
        var optionLabel: (Value) -> String

        var body: some View {
            Menu {
                Picker(title, selection: $selection) {
                    ForEach(options, id: \.self) { Text(optionLabel($0)).tag($0) }
                }
            } label: {
                HStack(spacing: 6) {
                    Text(optionLabel(selection)).textRole(.body).foregroundStyle(Color.link)
                    Image(systemName: "chevron.up.chevron.down").font(.footnote).foregroundStyle(Color.link)
                }
                .padding(.horizontal, 12)
                .frame(minHeight: minTarget)
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(
                        Color.controlBorder, lineWidth: 1)
                )
            }
            .accessibilityLabel(title)
            .accessibilityValue(optionLabel(selection))
        }
    }

    /// The search field (Jobs, Customers): magnifying glass, placeholder, a clear button while it
    /// has text. Filters as you type; no Search button.
    struct SearchField: View {
        @Binding var text: String
        var placeholder: String
        @FocusState private var focused: Bool

        var body: some View {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Color.textMuted).accessibilityHidden(true)
                TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(Color.placeholder))
                    .focused($focused)
                    .submitLabel(.search)
                    .autocorrectionDisabled()
                    .accessibilityLabel(placeholder)
                if !text.isEmpty {
                    Button {
                        text = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(Color.textMuted)
                            .frame(width: 32, height: 32)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Clear Search")
                }
            }
            .fieldBox(focused: focused)
        }
    }

    /// A row with its label on the left and the system switch on the right (on: `pass`).
    struct SwitchRow: View {
        var title: String
        var detail: String?
        @Binding var isOn: Bool

        init(_ title: String, detail: String? = nil, isOn: Binding<Bool>) {
            self.title = title
            self.detail = detail
            _isOn = isOn
        }

        var body: some View {
            Toggle(isOn: $isOn) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).textRole(.body).foregroundStyle(Color.text)
                    if let detail { Text(detail).textRole(.secondary).foregroundStyle(Color.textMuted) }
                }
            }
            .tint(Color.pass)
            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
            .padding(.vertical, CGFloat(Spacing.rowVertical))
            .frame(minHeight: minTarget)
        }
    }

    /// The round check of maintenance checklist items and Getting Started: a 2 pt
    /// `controlBorder` ring to do; `pass` with a white check when done.
    struct RoundCheck: View {
        var done: Bool

        var body: some View {
            ZStack {
                if done {
                    Circle().fill(Color.pass)
                        .transition(.scale(scale: 0.4).combined(with: .opacity))
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .heavy))
                        .foregroundStyle(Color.onStatus)
                        .transition(.scale(scale: 0.4).combined(with: .opacity))
                } else {
                    Circle().strokeBorder(Color.controlBorder, lineWidth: 2)
                }
            }
            // Ticking a step pops the check in.
            .animation(Motion.bouncy, value: done)
            .frame(width: 24, height: 24)
            .accessibilityHidden(true)
        }
    }

    /// A date (and optionally time) with its label, opening the system's compact picker. Shown as
    /// "Oct 19, 2026" and "9:00 AM".
    struct DateField: View {
        var label: String
        @Binding var selection: Date
        var components: DatePickerComponents = [.date]

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                FieldLabel(label)
                DatePicker(label, selection: $selection, displayedComponents: components)
                    .labelsHidden()
                    .datePickerStyle(.compact)
                    .tint(Color.link)
            }
        }
    }
#endif
