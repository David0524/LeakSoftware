import Foundation
import Observation
import SundeckCore

// Drafts (owner, 2026-10-27: "Fix the draft text"): typed text in a form that isn't saved yet is
// kept on the phone (the `app_kv` store) as it's typed, when the app goes to the background, and
// put back when the same form opens again, until it is saved, sent or discarded. Words, expiry
// and limits: SundeckCore/Drafts.swift. Port of apps/mobile/src/lib/drafts.ts and ui/useDraft.ts.

extension KVKey {
    /// The list of stored draft keys, so sign-out and the seven-day sweep can find them.
    public static let draftIndex = "drafts:index"
}

extension KeyValue {
    private var draftKeys: [String] {
        (getJSON(KVKey.draftIndex, as: [String].self) ?? []).filter { $0.hasPrefix(Drafts.prefix) }
    }

    private func setDraftKeys(_ keys: [String]) {
        if keys.isEmpty { remove(KVKey.draftIndex) } else { setJSON(KVKey.draftIndex, keys) }
    }

    private func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }

    /// A saved draft's fields (an expired or damaged one is removed), or nil.
    public func loadDraft(user: String, form: String, id: String, now: Double? = nil) -> [String: String]? {
        let key = Drafts.key(user: user, form: form, id: id)
        guard let raw = get(key) else { return nil }
        let fields = Drafts.read(raw, now: now ?? nowMs())
        if fields == nil { dropDraft(user: user, form: form, id: id) }
        return fields
    }

    /// Keeps these fields as the form's draft; nothing typed (only blanks) removes it.
    public func saveDraft(user: String, form: String, id: String, fields: [String: String], now: Double? = nil) {
        guard let record = Drafts.record(fields, now: now ?? nowMs()) else {
            return dropDraft(user: user, form: form, id: id)
        }
        let key = Drafts.key(user: user, form: form, id: id)
        setJSON(key, record)
        let keys = draftKeys
        if !keys.contains(key) { setDraftKeys(keys + [key]) }
    }

    /// Removes the form's draft (saved, sent or discarded).
    public func dropDraft(user: String, form: String, id: String) {
        let key = Drafts.key(user: user, form: form, id: id)
        remove(key)
        let keys = draftKeys
        if keys.contains(key) { setDraftKeys(keys.filter { $0 != key }) }
    }

    /// Every draft on this phone (sign-out).
    public func dropAllDrafts() {
        for key in draftKeys { remove(key) }
        remove(KVKey.draftIndex)
    }

    /// Removes drafts past their seven days (run when a form opens).
    public func sweepDrafts(now: Double? = nil) {
        let at = now ?? nowMs()
        let keys = draftKeys
        let live = keys.filter { key in
            if Drafts.read(get(key), now: at) != nil { return true }
            remove(key)
            return false
        }
        if live.count != keys.count { setDraftKeys(live) }
    }
}

/// One form's draft: put back when the form opens, kept while it's typed in, removed when it's
/// saved or discarded. Held by the form (`@State`), driven by the `keepsDraft` modifier.
@MainActor @Observable
public final class DraftHandle {
    /// A draft was put back into the form: the "Draft restored" note shows.
    public private(set) var restored = false

    @ObservationIgnored private var kv: KeyValue?
    @ObservationIgnored private var user = ""
    @ObservationIgnored private var form = ""
    @ObservationIgnored private var id = "new"
    /// How the form opened, to tell typing from the starting values, and to undo a restore.
    @ObservationIgnored private var opened: [String: String]?
    @ObservationIgnored private var before: [String: String] = [:]
    @ObservationIgnored private var latest: [String: String] = [:]
    @ObservationIgnored private var apply: (([String: String]) -> Void)?
    @ObservationIgnored private var saving: Task<Void, Never>?

    public init() {}

    /// The form is ready (its own starting values are in `fields`): note them and put back a draft,
    /// once.
    public func open(
        kv: KeyValue, user: String, form: String, id: String, fields: [String: String],
        restore: @escaping ([String: String]) -> Void
    ) {
        guard opened == nil else { return }
        self.kv = kv
        self.user = user
        self.form = form
        self.id = id
        apply = restore
        latest = fields
        opened = fields
        kv.sweepDrafts()
        guard let draft = kv.loadDraft(user: user, form: form, id: id) else { return }
        let changes = Drafts.changes(current: fields, draft: draft)
        guard !changes.isEmpty else { return }
        before = changes.keys.reduce(into: [:]) { $0[$1] = fields[$1] ?? "" }
        restore(changes)
        restored = true
    }

    /// The form's text changed: kept a moment after the last change.
    public func changed(_ fields: [String: String]) {
        latest = fields
        guard opened != nil else { return }
        saving?.cancel()
        saving = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(Drafts.saveDelayMs))
            guard !Task.isCancelled else { return }
            self?.keep()
        }
    }

    /// Kept at once (the app going to the background, the form closing): the phone may end the app.
    public func flush() {
        guard saving != nil else { return }
        keep()
    }

    private func keep() {
        saving?.cancel()
        saving = nil
        guard let kv, let opened else { return }
        // Back to how it opened: nothing to keep.
        if latest == opened {
            kv.dropDraft(user: user, form: form, id: id)
        } else {
            kv.saveDraft(user: user, form: form, id: id, fields: latest)
        }
    }

    /// Saved, sent or discarded: the draft is removed, and what the form holds now counts as its
    /// starting point, so only typing after this is kept again.
    public func clear() {
        saving?.cancel()
        saving = nil
        opened = latest
        restored = false
        kv?.dropDraft(user: user, form: form, id: id)
    }

    /// Discard Draft: the form goes back to how it opened and the draft is removed.
    public func discard() {
        apply?(before)
        before = [:]
        saving?.cancel()
        saving = nil
        restored = false
        kv?.dropDraft(user: user, form: form, id: id)
    }
}
