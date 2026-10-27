#if os(iOS)
    import SundeckCore
    import SwiftUI

    // Drafts (owner, 2026-10-27: "Fix the draft text"): see Model/Drafts.swift.

    /// "Draft restored" with Discard Draft, at the top of a form whose typed text came back from a
    /// draft. Quiet: a gray grouped row, not a banner.
    struct DraftNote: View {
        var draft: DraftHandle

        var body: some View {
            if draft.restored {
                HStack(spacing: 8) {
                    Text(Drafts.note).textRole(.secondary).foregroundStyle(Color.textMuted)
                    Spacer(minLength: 0)
                    Button(Drafts.discardLabel) { draft.discard() }.buttonStyle(.quiet).fixedSize()
                }
                .padding(.leading, 16)
                .frame(minHeight: minTarget)
                .background(
                    Color.surface, in: RoundedRectangle(cornerRadius: CGFloat(Radius.block), style: .continuous)
                )
                .accessibilityElement(children: .contain)
            }
        }
    }

    extension View {
        /// Keeps `fields` (typed text by name) as the draft for `form` and `id` (the record being
        /// edited, "new" for a form that makes one): saved a moment after typing and when the app
        /// goes to the background, put back (`restore` gets the fields that differ) when the form
        /// opens again, until `draft.clear()` (saved, sent) or Discard Changes. `ready` is false
        /// while the form's own starting values are still loading.
        func keepsDraft(
            _ draft: DraftHandle, form: String, id: String = "new", fields: [String: String], ready: Bool = true,
            restore: @escaping ([String: String]) -> Void
        ) -> some View {
            modifier(DraftKeeping(draft: draft, form: form, id: id, fields: fields, ready: ready, restore: restore))
        }
    }

    private struct DraftKeeping: ViewModifier {
        var draft: DraftHandle
        var form: String
        var id: String
        var fields: [String: String]
        var ready: Bool
        var restore: ([String: String]) -> Void
        @Environment(Session.self) private var session
        @Environment(\.scenePhase) private var phase
        @Environment(UnsavedEdits.self) private var edits: UnsavedEdits?

        func body(content: Content) -> some View {
            content
                .onChange(of: ready, initial: true) { _, now in
                    guard now, let user = session.user?.id else { return }
                    draft.open(
                        kv: session.sync.kv, user: user, form: form, id: id, fields: fields, restore: restore)
                }
                .onChange(of: fields) { _, now in draft.changed(now) }
                .onChange(of: phase) { _, now in if now != .active { draft.flush() } }
                // Discard Changes for a notification or Live Activity link closes every editor.
                .onChange(of: edits?.discarded ?? 0) { _, _ in draft.clear() }
                .onDisappear { draft.flush() }
        }
    }
#endif
