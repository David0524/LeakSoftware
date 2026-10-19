import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Supabase
import Testing

@testable import SundeckApp

#if canImport(FoundationNetworking)
    import FoundationNetworking
#endif

/// S6's "Done when": a report signed and sent from the Swift app opens on the website the same as
/// one sent from the Expo app. Runs the phone's path against the dev project and sundeckpro.com:
/// an inspection entered through the app's writes, the draft written on the server, the customer's
/// signature drawn and uploaded, the report finished and sent by text (`sms_device` only returns
/// the message; nothing is texted), then the customer page is checked for what the M8.5
/// Playwright test checks on an Expo-sent report. Needs the network, so it runs only with
/// `SUNDECK_LIVE=1`. Each run leaves one job, its report and a signature in the demo company.
@Suite(.serialized, .enabled(if: ProcessInfo.processInfo.environment["SUNDECK_LIVE"] == "1")) @MainActor
struct LiveReportTests {
    @Test(.timeLimit(.minutes(5)))
    func aReportSignedAndSentFromThePhoneOpensOnTheWebsite() async throws {
        let check = ServerCheck(client: ServerCheck.makeClient())
        _ = try await check.signIn(email: "tech@demo.leakbook.test", password: "leakbook-demo")
        let client = check.client
        let token: @Sendable () async -> String? = { try? await client.auth.session.accessToken }
        let userId = try await client.auth.session.user.id.uuidString.lowercased()

        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("live-report-\(UUID())")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let db = try Database(
            path: folder.appendingPathComponent("app.db").path, key: String(repeating: "5a", count: 32))
        let store = try LocalStore.open(db)
        let media = MediaFiles(root: folder)
        let sync = SyncService(
            store: store, kv: try KeyValue(db), transport: SupabaseTransport(SupabaseRPC(client)), auth: LiveAuth(),
            uploader: TusUploader(
                supabaseUrl: AppConfig.supabaseURL.absoluteString, apiKey: AppConfig.supabasePublishableKey,
                accessToken: { await token() }, files: media.source),
            media: media)
        await sync.syncNow()
        let companyRow = try #require(try store.list("company").first)
        let company = try #require(companyRow["id"]?.string)

        // ---- The visit, entered on the phone ----
        let run = String(UUID().uuidString.prefix(6))
        let customer = try sync.insert("customer", companyId: company, ["name": .string("Swift Report \(run)")])
        let property = try sync.insert(
            "property", companyId: company,
            [
                "customer_id": .string(customer), "address_line1": "12 Report Way", "city": "Mesa", "state": "AZ",
                "has_pool": true, "has_spa": false, "pool_type": "gunite_plaster",
            ])
        let job = try sync.insert(
            "job", companyId: company,
            [
                "property_id": .string(property), "bill_to_customer_id": .string(customer), "status": "in_progress",
                "type": "detection", "assigned_user_id": .string(userId), "fee_cents": 64900,
                "started_at": .string(isoTimestamp(milliseconds: Date().timeIntervalSince1970 * 1000)),
            ])
        let propertyRow = try JSONValue.object(try #require(try store.get("property", property))).decode(Property.self)
        let config = InspectionConfig(store, companyId: company)
        try InspectionWrites.createChecklist(
            sync, companyId: company, jobId: job, types: config.componentTypes, property: propertyRow,
            jobType: .detection)
        let inspection = JobInspection(store, jobId: job)
        for c in inspection.components {
            let leaking = config.componentTypeById[c.componentTypeId]?.key == "skimmer_seam"
            try InspectionWrites.setVerdict(
                sync, companyId: company, jobId: job, componentId: c.id, existing: inspection.resultByComponent[c.id],
                verdict: leaking ? .leaking : .ok, userId: userId)
        }
        let items = inspection.components.count

        // ---- The draft, written on the server ----
        let server = ReportServer(sync: sync, api: WebAPI(baseURL: AppConfig.webURL, accessToken: token))
        let draft = try await server.writeDraft(jobId: job, template: .homeowner)
        #expect(!draft.reportId.isEmpty)
        #expect(jobReports(store, jobId: job).first?.id == draft.reportId)

        // ---- The customer signs on the phone; the drawing uploads ----
        let purpose = try #require(reportSignOffPurposes(companyRow["settings"]).first?.value)
        let strokes: [SignatureStroke] = [
            (0..<40).map { SIMD2(20 + Double($0) * 6, 60 + sin(Double($0) / 3) * 25) },
            (0..<20).map { SIMD2(80 + Double($0) * 4, 30 + Double($0) * 3) },
        ]
        #expect(inkLength(strokes) >= minInk)
        let signature = try SignatureWrites.save(
            sync, companyId: company, jobId: job, purpose: purpose, signerName: "Riley Rivera \(run)",
            signerRole: "Homeowner", strokes: strokes, at: nil)
        await sync.syncNow()  // the row, then the drawing
        await sync.syncNow()
        #expect(sync.status.uploadsWaiting == 0, "\(sync.status.lastUploadError ?? "")")

        // ---- Finished and sent ----
        let finished = try await server.finish(reportId: draft.reportId, customerAway: false)
        #expect(!finished.isEmpty)
        let sent = try await server.send(reportId: draft.reportId, channel: .smsDevice, to: nil)
        #expect(sent.link.contains("/r/"))
        #expect(!sent.emailed)
        let report = try #require(jobReports(store, jobId: job).first { $0.id == draft.reportId })
        #expect(report.status == .sent)
        #expect(report.token != nil)
        #expect(try store.get("signature", signature)?["report_id"] == .string(draft.reportId))

        // ---- The customer page shows what an Expo-sent report shows ----
        let (data, response) = try await URLSession.shared.data(from: try #require(URL(string: sent.link)))
        #expect((response as? HTTPURLResponse)?.statusCode == 200)
        let page = String(decoding: data, as: UTF8.self)
        #expect(page.contains("Swift Report \(run)"))
        #expect(page.contains("Items Pass"))
        #expect(page.contains("Leaking"))
        #expect(page.contains("Skimmer seam"))
        #expect(page.contains("$649.00"))
        #expect(page.contains("Signature of Riley Rivera \(run)"))
        #expect(page.contains(String(items - 1)))
        try await check.signOut()
    }
}

/// The session lives in the Supabase client; this backend only says someone is signed in.
private struct LiveAuth: AuthBackend {
    func currentSession() async -> SignInResult? {
        SignInResult(user: SignedInUser(id: "live", email: "tech@demo.leakbook.test"), needsCode: false)
    }
    func signIn(email: String, password: String) async throws -> SignInResult { throw AuthMessage("not used") }
    func signUp(name: String, email: String, password: String) async throws -> Bool { false }
    func verifyCode(_ code: String) async throws {}
    func refresh() async throws {}
    func signOut() async {}
}
