#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI
    import UIKit

    /// The sample job's page (owner, 2026-10-22: "open it to a finished report with their own
    /// logo, then prompt 'Send yourself this report'"; docs/design/2026-10-22-first-win.md). As the
    /// website and Android: the card with Send Yourself This Report, View Report and Delete
    /// Sample, then the finished report with the shop's own name and logo, which follow Settings.
    struct SampleJobScreen: View {
        var job: JobView
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openTab) private var openTab
        @Environment(\.openRoute) private var openRoute
        @State private var logo: UIImage?
        @State private var sending = false
        @State private var sent: (text: String, fallback: Bool)?
        @State private var error: String?
        @State private var asking = false
        @State private var deleting = false
        @State private var browsing: BrowsedPage?

        private var report: Row? {
            ((try? sync.store.list("report", companyId: session.company?.id ?? "")) ?? [])
                .filter {
                    $0["job_id"]?.string == job.id && $0["status"]?.string == "sent" && $0["deleted_at"]?.string == nil
                }
                .max { ($0["version"]?.number ?? 0) < ($1["version"]?.number ?? 0) }
        }

        private func token(_ report: Row) -> String? {
            ((try? sync.store.list("share_link", companyId: session.company?.id ?? "")) ?? []).first {
                $0["report_id"]?.string == report.id && $0["revoked_at"]?.string == nil
            }?["token"]?.string
        }

        var body: some View {
            let report = self.report
            let shop = report?["data_snapshot"]?["company"]
            let logoPath = shop?["logo_path"]?.string
            let link = report.flatMap(token)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 8) {
                        SamplePill()
                        if let tz = session.company?.timeZone {
                            Text((try? formatSchedule(job.job["scheduled_start"]?.string, Date(), tz)) ?? "")
                                .textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                    }
                    card(logoPath: logoPath, link: link)
                    if let report { reportView(report, shop: shop) }
                    Button(role: .destructive) {
                        asking = true
                    } label: {
                        BusyButtonLabel(SampleText.delete, busy: deleting, busyTitle: SampleText.delete)
                    }
                    .buttonStyle(.danger(fullWidth: true))
                    .disabled(deleting)
                }
                .padding(.horizontal, CGFloat(Spacing.pageMargin))
                .padding(.vertical, 16)
            }
            .background(Color.bg)
            .confirmationDialog(SampleText.deleteTitle, isPresented: $asking, titleVisibility: .visible) {
                Button(SampleText.delete, role: .destructive) { Task { await delete() } }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(SampleText.deleteMessage)
            }
            .browser($browsing)
            .task(id: logoPath) { await loadLogo(logoPath) }
        }

        private func card(logoPath: String?, link: String?) -> some View {
            VStack(alignment: .leading, spacing: 8) {
                Text(SampleText.title).textRole(.cardTitle).foregroundStyle(Color.text)
                    .accessibilityAddTraits(.isHeader)
                Text(SampleText.body).textRole(.body).foregroundStyle(Color.text)
                if logoPath == nil {
                    Text(SampleText.addLogo).textRole(.secondary).foregroundStyle(Color.textMuted)
                }
                VStack(spacing: 8) {
                    Button {
                        Task { await send() }
                    } label: {
                        BusyButtonLabel(SampleText.send, busy: sending, busyTitle: SampleText.sending)
                    }
                    .buttonStyle(.primary(fullWidth: true))
                    .disabled(sending)
                    if let link {
                        Button(SampleText.view) { browsing = BrowsedPage(url: reportURL(AppConfig.webURL, link)) }
                            .buttonStyle(.secondary(fullWidth: true))
                    }
                    if logoPath == nil {
                        Button(SampleText.addLogoLink) { openRoute(.more(.settingsPage(.company))) }
                            .buttonStyle(.quiet)
                    }
                }
                .padding(.top, 8)
                if let email = session.user?.email, !email.isEmpty {
                    Text("It goes to \(email), and only you.").textRole(.secondary).foregroundStyle(Color.textMuted)
                }
                if let sent { Notice(kind: sent.fallback ? .warning : .success, text: sent.text) }
                if let error { Notice(kind: .error, text: error) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()
        }

        private func reportView(_ report: Row, shop: JSONValue?) -> some View {
            let brandHex = shop?["brand_primary"]?.string ?? "#12263A"
            let onBrand = colorFromHex(textOnBrand(brandHex)) ?? .white
            let sections = report["final_sections"]?.array ?? []
            return VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 4) {
                    if let logo {
                        Image(uiImage: logo).resizable().scaledToFit()
                            .frame(maxWidth: 160, maxHeight: 56, alignment: .leading)
                            .padding(4)
                            .background(RoundedRectangle(cornerRadius: 4).fill(Color.surface))
                            .accessibilityLabel("\(shop?["name"]?.string ?? "Shop") logo")
                            .padding(.bottom, 4)
                    }
                    Text(shop?["name"]?.string ?? session.company?.name ?? "").textRole(.cardTitle)
                    Text(reportTitle(job.type.rawValue)).textRole(.secondary)
                }
                .foregroundStyle(onBrand)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
                .background(colorFromHex(brandHex) ?? Color.brandPrimary)
                VStack(alignment: .leading, spacing: 16) {
                    Notice(kind: .warning, text: SampleText.reportBanner)
                    ForEach(Array(sections.enumerated()), id: \.offset) { _, s in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(s["title"]?.string ?? "").textRole(.subHeading).foregroundStyle(Color.text)
                                .accessibilityAddTraits(.isHeader)
                            Text(s["text"]?.string ?? "").textRole(.body).foregroundStyle(Color.text)
                        }
                    }
                }
                .padding(20)
            }
            .card(padding: 0)
            .clipShape(RoundedRectangle(cornerRadius: CGFloat(Radius.block), style: .continuous))
        }

        private func loadLogo(_ path: String?) async {
            guard let path,
                let url = try? await app.client.storage.from("company-assets").createSignedURL(
                    path: path, expiresIn: 3600),
                let (data, _) = try? await URLSession.shared.data(from: url)
            else {
                logo = nil
                return
            }
            logo = UIImage(data: data)
        }

        private func send() async {
            guard !sending else { return }
            sending = true
            error = nil
            defer { sending = false }
            do {
                let r = try await app.api.post("api/jobs/\(job.id)/sample")
                let message = r["message"]?.string ?? ""
                if r["emailed"]?.bool == true {
                    sent = (message, false)
                } else {
                    sent = ("\(message) Here’s the report instead.", true)
                    if let link = r["link"]?.string, let url = URL(string: link) { browsing = BrowsedPage(url: url) }
                }
            } catch {
                self.error = userMessage(error)
            }
        }

        private func delete() async {
            guard !deleting else { return }
            deleting = true
            defer { deleting = false }
            do {
                _ = try await app.api.send("DELETE", "api/jobs/\(job.id)/sample")
                await sync.syncNow()
                openTab(.today)
            } catch {
                self.error = userMessage(error)
            }
        }
    }
#endif
