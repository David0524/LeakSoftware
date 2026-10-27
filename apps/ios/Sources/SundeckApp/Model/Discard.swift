import Foundation
import Observation

// Discard changes, everywhere (owner, 2026-10-20: "should apply everywhere";
// docs/design/2026-10-20-one-handed-use.md, last section): every editor with unsaved changes asks
// before closing, whichever way it closes: Cancel, swiping the sheet down, Back, or a
// notification or Live Activity opening another screen. Nothing asks when nothing changed, after
// a save, or for fields that save by themselves.

/// The question's words, the same on every editor.
public enum DiscardText {
    public static let title = "Discard changes?"
    public static let keepEditing = "Keep Editing"
    public static let discard = "Discard Changes"
}

/// The editors open now with unsaved changes, by a key each editor picks (its screen, plus the
/// job for parts of a job page). A link from a notification or the Live Activity waits here while
/// any are open, until the person discards them or keeps editing.
@MainActor @Observable
public final class UnsavedEdits {
    public private(set) var keys: Set<String> = []
    /// The editors among `keys` shown as sheets: they ask about a link themselves, since nothing
    /// under a sheet can show a question.
    public private(set) var sheets: Set<String> = []
    /// The link that arrived while something was unsaved; the question shows while it's set.
    public private(set) var heldLink: AppLink?
    /// The link to open now that the person chose Discard Changes for it.
    public private(set) var released: AppLink?
    /// Goes up each time the person discards for a link: open editors close themselves.
    public private(set) var discarded = 0

    /// The typed-text drafts of the editors in `keys` (owner, 2026-10-27), so Discard Changes on a
    /// screen made of parts can clear them all.
    @ObservationIgnored private var drafts: [String: [DraftHandle]] = [:]

    public init() {}

    /// An editor's drafts, by the same key as `set` (an empty list forgets them).
    public func track(_ key: String, drafts handles: [DraftHandle]) {
        if handles.isEmpty { drafts[key] = nil } else { drafts[key] = handles }
    }

    /// Discard Changes for a screen: the drafts of everything under `prefix` go.
    public func clearDrafts(under prefix: String) {
        for (key, handles) in drafts where key == prefix || key.hasPrefix(prefix + ":") {
            for handle in handles { handle.clear() }
        }
    }

    /// An editor's changes now: dirty or not (a closed editor reports `false`).
    public func set(_ key: String, dirty: Bool, sheet: Bool = false) {
        if dirty { keys.insert(key) } else { keys.remove(key) }
        if dirty && sheet { sheets.insert(key) } else { sheets.remove(key) }
    }

    public var any: Bool { !keys.isEmpty }
    public var anySheet: Bool { !sheets.isEmpty }

    /// Whether anything under `prefix` (for example "job:<id>") is unsaved.
    public func any(under prefix: String) -> Bool { keys.contains { $0 == prefix || $0.hasPrefix(prefix + ":") } }

    /// A link arrived: returned to open now, or held (nil) while something is unsaved.
    public func arrive(_ link: AppLink) -> AppLink? {
        guard any else { return link }
        heldLink = link
        return nil
    }

    /// Discard Changes for the held link: every editor closes, and the link is released to open.
    public func discardForLink() {
        guard let link = heldLink else { return }
        heldLink = nil
        keys = []
        sheets = []
        discarded += 1
        released = link
    }

    /// The released link, once.
    public func takeReleased() -> AppLink? {
        defer { released = nil }
        return released
    }

    /// Keep Editing: the link is dropped and the editors stay as they were.
    public func keepEditing() { heldLink = nil }
}

/// Whether typed text differs from what's saved, ignoring spaces at the ends (a field left as it
/// was, or with only a stray space, asks nothing).
public func textChanged(_ typed: String, from saved: String) -> Bool {
    typed.trimmingCharacters(in: .whitespacesAndNewlines) != saved.trimmingCharacters(in: .whitespacesAndNewlines)
}
