#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Where a removal says so (owner, 2026-10-26: Undo instead of "Are you sure?"): "Photo
    /// removed" with Undo for five seconds, on the screen that is showing, however the removal was
    /// made (a swipe, a sheet that has since closed, a button on a pushed screen). The banner is
    /// the one Today, Schedule and Invoices already use. Website: showRemoved; Android:
    /// announceRemoved.
    @MainActor @Observable
    final class RemovalCenter {
        /// What's showing, if anything.
        var banner: ResultBanner?
        /// What Undo does.
        private(set) var undo: (() -> Void)?
        /// The screen that shows it: the one that appeared last (a pushed screen covers the one
        /// under it, and a sheet has none of its own, so it shows on the screen below).
        var host: UUID?

        /// Marks `rows` deleted and says so, with Undo that writes them back.
        func remove(
            _ kind: RemovedKind, _ rows: [RemovalRow], sync: SyncService, companyId: String, detail: String? = nil
        ) throws {
            try RemovalWrites.remove(sync, companyId: companyId, rows: rows)
            show(kind, detail: detail) { [weak sync] in
                guard let sync else { return }
                try? RemovalWrites.restore(sync, companyId: companyId, rows: rows)
            }
        }

        /// An item taken off a job's checklist: it and its result go together and come back
        /// together. A scheduled cleaning stays due on its plan, so it goes on the next visit, and
        /// the banner says so (core `removeItemConfirm`).
        func removeChecklistItem(
            _ component: JobComponent, result: ChecklistItemResult?, sync: SyncService, companyId: String
        ) throws {
            try remove(
                .checklistItem, RemovalRow.checklistItem(component, result), sync: sync, companyId: companyId,
                detail: removeItemConfirm(component.label, fromPlan: component.planCleaningId != nil).message)
        }

        /// A removal made some other way (a repair also rewrites its job's price), with its Undo.
        func show(_ kind: RemovedKind, detail: String? = nil, undo: @escaping () -> Void) {
            self.undo = undo
            banner = ResultBanner(
                kind: .success, title: kind.text, detail: detail, undoable: true, undoHint: "Puts it back",
                holdSeconds: Double(RemovedUndo.seconds))
        }
    }

    extension View {
        /// Shows this app's removal banner here, while this screen is the one in front.
        func removalBanner() -> some View { modifier(RemovalBannerHost()) }
    }

    private struct RemovalBannerHost: ViewModifier {
        @Environment(AppEnvironment.self) private var app
        @State private var id = UUID()

        func body(content: Content) -> some View {
            let center = app.removals
            content
                .resultBanner(
                    Binding(
                        get: { center.host == id ? center.banner : nil },
                        set: { center.banner = $0 }),
                    onUndo: center.undo
                )
                .onAppear { center.host = id }
                .onDisappear { if center.host == id { center.host = nil } }
        }
    }
#endif
