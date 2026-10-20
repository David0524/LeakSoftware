import Foundation
import SundeckCore

// Phone fields format themselves as they're typed (owner, 2026-10-20: "When you type in Phone
// numbers it should put the parentheses and dash in for you"): every phone-pad field in the app,
// with core `formatPhoneTyping`. Port of apps/web/src/components/phone-format.tsx for a SwiftUI
// field, which reports the value before and after each edit rather than the caret.

/// What a phone field holds after an edit: `raw` (what the field now holds) formatted, where
/// `previous` is what it held before. Deleting a ")", "-" or space of a formatted number takes
/// away the digit before it instead of the mark coming straight back.
public func phoneTypingEdit(previous: String, raw: String) -> String {
    var raw = raw
    let before = Array(previous.utf16)
    let after = Array(raw.utf16)
    let digits = phoneDigits(raw)
    // Only marks went: the number is unchanged and the field got shorter.
    if after.count < before.count, phoneDigits(previous) == digits,
        previous.hasPrefix("(") || previous.hasPrefix("+1")
    {
        // Where the edit was: the first place the two differ, i.e. the caret after the delete.
        var caret = 0
        while caret < after.count, after[caret] == before[caret] { caret += 1 }
        let digitsBefore = phoneDigits(String(decoding: after[..<caret], as: UTF16.self)).count
        if digitsBefore > 0 {
            var list = Array(digits)
            list.remove(at: digitsBefore - 1)
            raw = String(list)
        }
    }
    return formatPhoneTyping(raw)
}

private func phoneDigits(_ text: String) -> String {
    String(String.UnicodeScalarView(text.unicodeScalars.filter { ("0"..."9").contains($0) }))
}
