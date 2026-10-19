#if os(iOS)
    import Supabase
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Job › Details › Timeline (spec 5.4, managers): who changed what, newest first, from the
    /// server's audit log (RLS gives techs nothing). It isn't synced, so it needs a signal.
    struct JobTimeline: View {
        var jobId: String
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @State private var events: [TimelineEvent]?
        @State private var offline = false
        @State private var showAll = false

        private static let shown = 3

        var body: some View {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Timeline").padding(.horizontal, 16)
                VStack(alignment: .leading, spacing: 4) {
                    if offline {
                        Text("The timeline shows when you’re online.").foregroundStyle(Color.textMuted)
                    } else if let events {
                        if events.isEmpty {
                            Text("No changes recorded yet.").foregroundStyle(Color.textMuted)
                        } else {
                            let rest = Array(events.dropFirst(Self.shown).prefix(197))
                            ForEach(Array(events.prefix(Self.shown).enumerated()), id: \.offset) { _, e in line(e) }
                            if showAll { ForEach(Array(rest.enumerated()), id: \.offset) { _, e in line(e) } }
                            if !rest.isEmpty {
                                Button(showAll ? "Show Less" : "Show \(rest.count) More") { showAll.toggle() }
                                    .textRole(.body)
                                    .foregroundStyle(Color.link)
                                    .frame(minHeight: minTarget)
                            }
                        }
                    } else {
                        Text("Loading…").foregroundStyle(Color.textMuted)
                    }
                }
                .textRole(.body)
                .card(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
            }
            .task(id: jobId) { await load() }
        }

        private func line(_ e: TimelineEvent) -> some View {
            let zone = session.company?.timeZone ?? "America/Phoenix"
            let when = (try? formatSchedule(e.at, Date(), zone)) ?? ""
            return
                (Text(e.text).foregroundStyle(Color.text)
                + Text(" · \(who(e.userId)) · \(when)").foregroundStyle(Color.textMuted))
                .textRole(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }

        private func who(_ id: String?) -> String {
            guard let id else { return "System" }
            return sync.kv.team.first { $0.id == id }?.displayName ?? "Teammate"
        }

        private func load() async {
            guard let company = session.company else { return }
            let subjects = TimelineSubjects(sync.store, companyId: company.id, jobId: jobId)
            do {
                let rows: [AuditEntry] = try await app.client.from("audit_log")
                    .select("user_id, table_name, row_id, field, old_value, new_value, created_at")
                    .eq("company_id", value: company.id)
                    .in("row_id", values: subjects.rowIds)
                    .order("created_at", ascending: false)
                    .limit(1000)
                    .execute().value
                events = timeline(rows, labelFor: subjects.label)
                offline = false
            } catch {
                if events == nil { offline = true }
            }
        }
    }
#endif
