#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// More › Sync (spec 6.6, apps only): when the phone last synced, what's waiting, Sync Now,
    /// the changes the server refused (each can be discarded), and this phone. The sync bar opens
    /// it too (its `Route.settings`); the account, help and signing out moved to More.
    struct SettingsView: View {
        var showReauth: () -> Void
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @State private var problems: [OutboxProblem] = []
        @State private var syncing = false
        @State private var discarding: OutboxProblem?

        var body: some View {
            let status = sync.status
            ScreenScroll {
                Grouped(footer: footer(status)) {
                    ListRow(
                        "Last synced",
                        value: status.lastSyncedAt.map { $0.formatted(date: .abbreviated, time: .shortened) } ?? "Never"
                    )
                    ListRow("Waiting to sync", value: "\(status.pending)")
                    ListRow("Waiting to upload", value: "\(status.uploadsWaiting)")
                }
                if status.phase == .signedOut {
                    Notice(
                        kind: .warning,
                        text: "Your sign-in expired. Sign in again to keep syncing; nothing on this phone is lost.")
                    Button("Sign In Again", action: showReauth).buttonStyle(.primary)
                } else {
                    Button {
                        Task {
                            syncing = true
                            await sync.syncNow()
                            syncing = false
                        }
                    } label: {
                        BusyButtonLabel("Sync Now", busy: syncing, busyTitle: "Syncing…")
                    }
                    .buttonStyle(.primary)
                    .disabled(syncing)
                }
                if !problems.isEmpty {
                    Grouped(label: "Changes that could not be saved") {
                        ForEach(problems, id: \.seq) { problem in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(problemTitle(problem)).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                                Text(problem.error).textRole(.secondary).foregroundStyle(Color.textMuted)
                                Button("Discard This Change", role: .destructive) { discarding = problem }
                                    .buttonStyle(.danger)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                Grouped(label: "This phone") {
                    ListRow("Device ID") {
                        Text(sync.store.deviceId)
                            .font(.footnote.monospaced())
                            .foregroundStyle(Color.textMuted)
                            .textSelection(.enabled)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                    ListRow("Local data", value: localData)
                }
            }
            .refreshable { await sync.syncNow() }
            .navigationTitle("Sync")
            .navigationBarTitleDisplayMode(.large)
            .task(id: sync.revision) { problems = (try? sync.store.problems()) ?? [] }
            .confirmationDialog(
                "Discard this change?",
                isPresented: Binding(get: { discarding != nil }, set: { if !$0 { discarding = nil } }),
                titleVisibility: .visible, presenting: discarding
            ) { problem in
                Button("Discard This Change", role: .destructive) { try? sync.discardProblem(problem.seq) }
            } message: { _ in
                Text("The office never got it. This can’t be undone.")
            }
            .sensoryFeedback(.success, trigger: sync.status.lastSyncedAt)
        }

        private func footer(_ status: SyncStatus) -> String? {
            if status.phase == .offline { return "This phone is offline. Changes are saved here and sync later." }
            if let error = status.error { return "Last error: \(error)" }
            if let error = status.lastUploadError { return "Last upload error: \(error)" }
            return nil
        }

        /// The database's size on this phone, and whether it's encrypted.
        private var localData: String {
            let encrypted = (try? sync.store.database.cipherVersion()) != nil ? "Encrypted" : "Not encrypted"
            guard
                let folder = try? FileManager.default.url(
                    for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: false)
            else { return encrypted }
            let bytes = ["", "-wal"].compactMap { suffix in
                (try? FileManager.default.attributesOfItem(
                    atPath: folder.appendingPathComponent("sundeck.db\(suffix)").path))?[.size] as? Int64
            }
            .reduce(0, +)
            return bytes > 0 ? "\(byteSize(bytes)) · \(encrypted)" : encrypted
        }
    }

#endif
