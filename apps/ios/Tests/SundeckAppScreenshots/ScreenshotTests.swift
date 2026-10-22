#if os(iOS)
    import Foundation
    import SundeckCore
    import SundeckStorage
    import SundeckSync
    import SwiftUI
    import Testing
    import UIKit

    @testable import SundeckApp

    // Renders each screen with sample data in the iPhone simulator and saves a PNG per screen, so
    // screens can be looked at from CI (cloud sessions have no simulator; docs/plans/swift-app.md).
    // The folder comes from SCREENSHOT_DIR (CI passes TEST_RUNNER_SCREENSHOT_DIR); without it the
    // tests still render every screen, which catches crashes and layout loops.

    /// A server stand-in that never answers: screenshots show the phone's own data.
    final class SilentTransport: SyncTransport, @unchecked Sendable {
        func push(_ mutations: [Mutation], deviceId: String) async throws -> PushResponse {
            throw SyncFailure("offline")
        }
        func pull(cursor: PullCursor, pageSize: Int) async throws -> PullPage { throw SyncFailure("offline") }
        func scope() async throws -> String? { nil }
    }

    struct SampleAuth: AuthBackend {
        func currentSession() async -> SignInResult? {
            SignInResult(user: SignedInUser(id: "u1", email: "tech@demo.leakbook.test"), needsCode: false)
        }
        func signIn(email: String, password: String) async throws -> SignInResult { throw AuthMessage("offline") }
        func signUp(name: String, email: String, password: String) async throws -> Bool { false }
        func verifyCode(_ code: String) async throws {}
        func refresh() async throws {}
        func signOut() async {}
    }

    @MainActor
    func sampleEnvironment(signedIn: Bool = true, jobs: Bool = true) throws -> AppEnvironment {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("shots-\(UUID()).db").path
        let db = try Database(path: path, key: String(repeating: "ab", count: 32))
        let store = try LocalStore.open(db, deviceId: "shots")
        let kv = try KeyValue(db)
        let auth = SampleAuth()
        let files = FileManager.default.temporaryDirectory.appendingPathComponent("shots-media-\(UUID())")
        let sync = SyncService(
            store: store, kv: kv, transport: SilentTransport(), auth: auth, media: MediaFiles(root: files))
        if signedIn {
            kv.setJSON(KVKey.user, SignedInUser(id: "u1", email: "tech@demo.leakbook.test"))
            kv.set(KVKey.lastSyncedAt, String(Date().addingTimeInterval(-120).timeIntervalSince1970))
            kv.setTeam([
                TeamProfile(id: "u1", fullName: "Dana Tech", email: "tech@demo.leakbook.test"),
                TeamProfile(id: "u2", fullName: "Tony Tech", email: nil),
            ])
            try store.applyPage(
                PullPage(
                    rows: [
                        PulledRow(
                            table: "company", xid: "1",
                            row: [
                                "id": "c1", "company_id": "c1", "name": "Demo Leak Co.",
                                "timezone": "America/Phoenix", "settings": ["services": "both"],
                            ]),
                        PulledRow(
                            table: "membership", xid: "1",
                            row: [
                                "id": "m1", "company_id": "c1", "user_id": "u1", "role": "owner", "status": "active",
                            ]),
                    ], done: true, cursor: [:], serverHLC: "1760000000000-0000-srv"))
            if jobs { try seedJobs(store) }
        }
        let client = ServerCheck.makeClient()
        let session = Session(sync: sync, auth: auth)
        return AppEnvironment(client: client, session: session, walkthrough: Walkthrough(kv))
    }

    func seedJobs(_ store: LocalStore) throws {
        let iso = { (offset: TimeInterval) in isoTimestamp(milliseconds: (Date().timeIntervalSince1970 + offset) * 1000)
        }
        let maria = try store.insert(
            "customer", companyId: "c1",
            ["name": "Maria Alvarez", "phone": "(602) 555-0199", "email": "maria@example.com"])
        let pool = try store.insert(
            "property", companyId: "c1",
            [
                "customer_id": .string(maria), "address_line1": "1423 Palm Ct", "city": "Mesa", "state": "AZ",
                "postal_code": "85201", "has_pool": true, "has_spa": true, "pool_type": "gunite_plaster",
                "approx_gallons": 20000, "access_notes": "Gate code 4417. Dog in the side yard.",
            ])
        try store.insert(
            "job", companyId: "c1",
            [
                "property_id": .string(pool), "bill_to_customer_id": .string(maria), "status": "in_progress",
                "type": "detection", "started_at": .string(iso(-1800)), "assigned_user_id": "u1", "number": 1042,
                "fee_cents": 64900,
            ])
        let sam = try store.insert("customer", companyId: "c1", ["name": "Sam Sample"])
        let samPool = try store.insert(
            "property", companyId: "c1",
            ["customer_id": .string(sam), "address_line1": "88 Desert Willow Dr", "city": "Gilbert", "has_pool": true])
        try store.insert(
            "job", companyId: "c1",
            [
                "property_id": .string(samPool), "status": "scheduled", "type": "maintenance",
                "scheduled_start": .string(iso(3 * 86400)), "number": 1043,
            ])
        try store.insert(
            "job", companyId: "c1", ["property_id": .string(samPool), "status": "unscheduled", "type": "repair"])
    }

    /// Today's route for the signed-in tech (u1) and a teammate: the shop and pools with map
    /// locations, three stops today in route order (one with access notes), and a stop tomorrow.
    func seedRoute(_ store: LocalStore) throws {
        let zone = "America/Phoenix"
        let today = localDay(Date(), timeZone: zone)
        let at = { (day: String, minutes: Int) -> JSONValue in
            .string(zonedInstant(day, minutes, timeZone: zone).map(isoString) ?? "")
        }
        try store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "company", xid: "4",
                        row: [
                            "id": "c1", "company_id": "c1", "name": "Demo Leak Co.", "timezone": "America/Phoenix",
                            "settings": ["services": "both"], "address_line1": "100 W Main St", "city": "Mesa",
                            "state": "AZ", "postal_code": "85201", "latitude": 33.4152, "longitude": -111.8315,
                        ]),
                    PulledRow(
                        table: "membership", xid: "4",
                        row: ["id": "m2", "company_id": "c1", "user_id": "u2", "role": "tech", "status": "active"]),
                ], done: true, cursor: [:], serverHLC: "1760000000003-0000-srv"))
        let stops: [(String, String, String, Double, Double, Int, String?, String)] = [
            ("Grace Holloway", "(480) 555-0142", "2215 E Brown Rd", 33.4365, -111.7890, 8 * 60, nil, "u1"),
            (
                "Riley Rivera", "(480) 555-0188", "41 Demo Lane", 33.3930, -111.8620, 10 * 60 + 30,
                "Gate code 4417. Dog in the side yard.", "u1"
            ),
            (
                "Daniel Reyes", "(602) 555-0110", "16705 E Avenue of the Fountains", 33.6050, -111.7200, 13 * 60 + 30,
                nil, "u1"
            ),
            ("Priya Shah", "(602) 555-0123", "455 N Galvin Pkwy", 33.4600, -111.9450, 9 * 60, nil, "u2"),
        ]
        for (i, s) in stops.enumerated() {
            let customer = try store.insert("customer", companyId: "c1", ["name": .string(s.0), "phone": .string(s.1)])
            let pool = try store.insert(
                "property", companyId: "c1",
                [
                    "customer_id": .string(customer), "address_line1": .string(s.2), "city": "Mesa", "state": "AZ",
                    "has_pool": true, "latitude": .number(s.3), "longitude": .number(s.4),
                    "access_notes": s.6.map { .string($0) } ?? .null,
                ])
            try store.insert(
                "job", companyId: "c1",
                [
                    "property_id": .string(pool), "bill_to_customer_id": .string(customer), "status": "scheduled",
                    "type": i == 3 ? "maintenance" : "detection", "assigned_user_id": .string(s.7),
                    "scheduled_start": at(today, s.5), "scheduled_end": at(today, s.5 + 120),
                    "number": .number(Double(1100 + i)),
                ])
        }
    }

    /// Daniel Reyes's stop becomes a maintenance visit with the filter and salt cell cleanings
    /// on its checklist (as the server puts them, `plan_cleaning_id` set). Returns the visit.
    @MainActor
    func seedCleanings(_ store: LocalStore) throws -> String? {
        let url = try #require(Bundle.module.url(forResource: "config", withExtension: "json"))
        var config = try JSONDecoder().decode([String: [Row]].self, from: Data(contentsOf: url))
        // Replace filter, which pool shops have from migration 20261012005800.
        if !(config["component_type"] ?? []).contains(where: { $0["key"] == "svc_filter_replace" }) {
            config["component_type", default: []].append([
                "id": "5d3c1f0e-7a2b-4c8e-9f61-2b4e8a9c7d10", "key": "svc_filter_replace", "name": "Replace filter",
                "active": true, "answer": "done", "methods": ["Service"], "section": "service",
                "job_type": "maintenance", "applies_to": "both", "deleted_at": nil, "sort_order": 547,
                "on_schedule": true, "default_count": 1, "allows_multiple": false, "applies_to_pool_type": nil,
            ])
        }
        let types = (config["component_type"] ?? []).map { row -> PulledRow in
            var r = row
            r["company_id"] = "c1"
            return PulledRow(table: "component_type", xid: "6", row: r)
        }
        try store.applyPage(PullPage(rows: types, done: true, cursor: [:], serverHLC: "1760000000006-0000-srv"))
        guard let visit = try store.list("job").first(where: { $0["number"] == 1102 }) else { return nil }
        let today = try localDate(Date(), "America/Phoenix")
        try store.write(
            "job", id: visit.id, companyId: "c1",
            ["type": "maintenance", "service_plan_id": "sp-shot", "plan_date": .string(today)])
        let byKey = Dictionary(
            (config["component_type"] ?? []).compactMap { r in r["key"]?.string.map { ($0, r) } },
            uniquingKeysWith: { a, _ in a })
        // The plan's cleanings as the server syncs them (owner, 2026-10-19): the filter and salt
        // cell due today, on this visit; and a filter replaced 8 months ago, due in 6 weeks.
        let specs: [(key: String, months: Int, due: String, last: String?)] = [
            ("svc_filter_clean", 3, today, nil), ("svc_salt_clean", 6, today, nil),
            ("svc_filter_replace", 12, try addDays(today, 42), try addDays(today, -243)),
        ]
        let planRows: [PulledRow] = specs.compactMap { spec in
            let (key, months, due, last) = spec
            guard let type = byKey[key] else { return nil }
            return PulledRow(
                table: "plan_cleaning", xid: "7",
                row: [
                    "id": .string("pc-\(key)"), "company_id": "c1", "service_plan_id": "sp-shot",
                    "component_type_id": type["id"] ?? .null, "every_months": .number(Double(months)),
                    "next_due": .string(due), "last_done_on": last.map { .string($0) } ?? .null,
                ])
        }
        try store.applyPage(PullPage(rows: planRows, done: true, cursor: [:], serverHLC: "1760000000007-0000-srv"))
        for (i, key) in ["svc_skim", "svc_filter_clean", "svc_salt_clean"].enumerated() {
            guard let type = byKey[key] else { continue }
            let component = try store.insert(
                "job_component", companyId: "c1",
                [
                    "job_id": .string(visit.id), "component_type_id": type["id"] ?? .null, "instance_number": 1,
                    "label": type["name"] ?? .null, "sort_order": .number(Double(i)),
                    "plan_cleaning_id": key == "svc_skim" ? .null : .string("pc-\(key)"),
                ])
            try store.insert(
                "checklist_item_result", companyId: "c1",
                ["job_id": .string(visit.id), "job_component_id": .string(component), "status": "pending"])
        }
        return visit.id
    }

    /// The sample job's inspection, partly done: config from a new shop, the default checklist,
    /// a few verdicts, a failing pressure test, and a pinned finding on a kidney pool.
    @MainActor
    func seedInspection(_ env: AppEnvironment) throws -> (job: String, seam: String, test: String, finding: String) {
        let sync = env.session.sync
        let url = try #require(Bundle.module.url(forResource: "config", withExtension: "json"))
        let config = try JSONDecoder().decode([String: [Row]].self, from: Data(contentsOf: url))
        var rows: [PulledRow] = []
        for (table, list) in config {
            for row in list {
                var r = row
                r["company_id"] = "c1"
                rows.append(PulledRow(table: table, xid: "2", row: r))
            }
        }
        try sync.store.applyPage(PullPage(rows: rows, done: true, cursor: [:], serverHLC: "1760000000001-0000-srv"))

        let jobs = try sync.store.list("job")
        let jobRow = try #require(jobs.first { $0["number"] == 1042 })
        let job = try #require(jobRow["id"]?.string)
        let propertyId = try #require(jobRow["property_id"]?.string)
        let stored = try sync.store.get("property", propertyId)
        let property = try JSONValue.object(try #require(stored)).decode(Property.self)
        try InspectionWrites.setDiagramShape(sync, propertyId: propertyId, companyId: "c1", shape: .kidney)
        let types = InspectionConfig(sync.store, companyId: "c1")
        try InspectionWrites.createChecklist(
            sync, companyId: "c1", jobId: job, types: types.componentTypes, property: property, jobType: .detection)
        let inspection = JobInspection(sync.store, jobId: job)
        let key = { (c: JobComponent) in types.componentTypeById[c.componentTypeId]?.key ?? "" }
        for (i, c) in inspection.components.enumerated() where i < 12 {
            let verdict: Verdict = key(c) == "skimmer_seam" ? .leaking : key(c) == "backwash" ? .attention : .ok
            try InspectionWrites.setVerdict(
                sync, companyId: "c1", jobId: job, componentId: c.id, existing: inspection.resultByComponent[c.id],
                verdict: verdict, userId: "u1")
        }
        let seam = try #require(inspection.components.first { key($0) == "skimmer_seam" })
        try InspectionWrites.saveChecklistResult(
            sync, companyId: "c1", jobId: job, componentId: seam.id,
            existing: JobInspection(sync.store, jobId: job).resultByComponent[seam.id],
            ["location_text": "Seam at the skimmer throat"])
        let pressure = try #require(types.testTypes.first { $0.key == "pressure" })
        let data = normalizeTestData(
            pressure.fieldSchema,
            ["line_name": "Skimmer", "start_psi": "20", "end_psi": "12", "duration_min": "15"].mapValues { .string($0) }
        )
        let test = try InspectionWrites.saveTest(
            sync, companyId: "c1", jobId: job, existing: nil, type: pressure, componentId: seam.id, data: data,
            outcome: calculate(pressure, data).suggested, notes: "")
        let finding = try InspectionWrites.saveFinding(
            sync, companyId: "c1", jobId: job, existing: nil, title: "Skimmer seam leak", componentId: seam.id,
            severityKey: "major", location: "Skimmer throat", pin: (0.18, 0.12), status: .open, notes: "")
        try seedPhoto(sync, job: job, componentId: seam.id)
        // A draft report, as the server writes it.
        try sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "report", xid: "3",
                        row: [
                            "id": "r1", "company_id": "c1", "job_id": .string(job), "template_key": "homeowner",
                            "version": 1, "status": "draft",
                            "final_sections": [
                                [
                                    "key": "summary", "title": "What We Found",
                                    "text":
                                        "We found one leak, at the skimmer seam. The other items we checked are not leaking.",
                                ],
                                [
                                    "key": "next_steps", "title": "Next Steps",
                                    "text": "Reseal the skimmer seam. We can quote the repair.",
                                ],
                            ],
                            "ai_draft": ["problems": []],
                        ])
                ], done: true, cursor: [:], serverHLC: "1760000000002-0000-srv"))
        return (job, seam.id, test, finding)
    }

    /// Money on the sample job: a price book item for the finding's item; then either a draft quote
    /// with two lines and a draft invoice, or (sent) an accepted quote with its deposit paid and a
    /// sent invoice with a payment.
    @MainActor
    func seedMoney(_ sync: SyncService, job: String, finding: String, sent: Bool = false) throws {
        let inspection = JobInspection(sync.store, jobId: job)
        let config = InspectionConfig(sync.store, companyId: "c1")
        let key = inspection.findings.first { $0.id == finding }?.jobComponentId
            .flatMap { inspection.componentById[$0] }
            .flatMap { config.componentTypeById[$0.componentTypeId]?.key }
        var rows: [PulledRow] = [
            PulledRow(
                table: "price_book_item", xid: "5",
                row: [
                    "id": "pb1", "company_id": "c1", "name": "Reseal skimmer throat", "unit": "each",
                    "price_cents": 45000, "taxable": true, "sort_order": 1, "active": true,
                    "component_type_key": key.map(JSONValue.string) ?? .null,
                ]),
            PulledRow(
                table: "price_book_item", xid: "5",
                row: [
                    "id": "pb2", "company_id": "c1", "name": "Dive fee", "unit": "each", "price_cents": 15000,
                    "taxable": false, "sort_order": 2, "active": true,
                ]),
        ]
        func line(_ id: String, _ table: String, _ parent: (String, String), _ fields: Row) -> PulledRow {
            var row: Row = ["id": .string(id), "company_id": "c1", parent.0: .string(parent.1)]
            row.merge(fields) { _, new in new }
            return PulledRow(table: table, xid: "5", row: row)
        }
        if sent {
            rows += [
                PulledRow(
                    table: "quote", xid: "5",
                    row: [
                        "id": "q1", "company_id": "c1", "job_id": .string(job), "number": 1006, "status": "accepted",
                        "subtotal_cents": 125000, "discount_cents": 0, "tax_cents": 0, "total_cents": 125000,
                        "deposit_cents": 62500, "accepted_at": "2026-10-14T17:00:00.000Z",
                        "accepted_by_name": "Maria Alvarez",
                    ]),
                line(
                    "ql1", "quote_line_item", ("quote_id", "q1"),
                    [
                        "description": "Repair underground pressure line (per break)", "quantity": 1,
                        "unit_price_cents": 125000, "taxable": false, "sort_order": 1,
                    ]),
                PulledRow(
                    table: "share_link", xid: "5",
                    row: ["id": "sl1", "company_id": "c1", "job_id": .string(job), "quote_id": "q1", "token": "q7Hk2"]),
                PulledRow(
                    table: "payment", xid: "5",
                    row: [
                        "id": "pay1", "company_id": "c1", "quote_id": "q1", "amount_cents": 62500, "method": "card",
                        "status": "succeeded", "paid_at": "2026-10-14T17:05:00.000Z",
                    ]),
                PulledRow(
                    table: "invoice", xid: "5",
                    row: [
                        "id": "i1", "company_id": "c1", "job_id": .string(job), "number": 1025,
                        "status": "partially_paid", "subtotal_cents": 64900, "discount_cents": 0, "tax_cents": 0,
                        "credit_cents": 0, "total_cents": 64900, "amount_paid_cents": 27400,
                    ]),
                line(
                    "il1", "invoice_line_item", ("invoice_id", "i1"),
                    [
                        "kind": "item", "description": "Leak detection", "quantity": 1, "unit_price_cents": 64900,
                        "taxable": false, "sort_order": 1,
                    ]),
                PulledRow(
                    table: "payment", xid: "5",
                    row: [
                        "id": "pay2", "company_id": "c1", "invoice_id": "i1", "amount_cents": 27400, "method": "other",
                        "status": "succeeded", "paid_at": "2026-10-15T18:00:00.000Z",
                    ]),
                PulledRow(
                    table: "share_link", xid: "5",
                    row: [
                        "id": "sl2", "company_id": "c1", "job_id": .string(job), "invoice_id": "i1", "token": "i9Lp4",
                    ]),
            ]
        } else {
            rows += [
                PulledRow(
                    table: "quote", xid: "5",
                    row: [
                        "id": "q1", "company_id": "c1", "job_id": .string(job), "status": "draft",
                        "subtotal_cents": 60000, "discount_cents": 0, "tax_cents": 0, "total_cents": 60000,
                        "deposit_cents": 0,
                    ]),
                line(
                    "ql1", "quote_line_item", ("quote_id", "q1"),
                    [
                        "description": "Reseal skimmer throat", "quantity": 1, "unit_price_cents": 45000,
                        "taxable": true, "sort_order": 1, "price_book_item_id": "pb1", "finding_id": .string(finding),
                    ]),
                line(
                    "ql2", "quote_line_item", ("quote_id", "q1"),
                    [
                        "description": "Dive fee", "quantity": 1, "unit_price_cents": 15000, "taxable": false,
                        "sort_order": 2, "price_book_item_id": "pb2",
                    ]),
                PulledRow(
                    table: "invoice", xid: "5",
                    row: [
                        "id": "i1", "company_id": "c1", "job_id": .string(job), "number": 1025, "status": "draft",
                        "subtotal_cents": 64900, "discount_cents": 0, "tax_cents": 0, "credit_cents": 0,
                        "total_cents": 64900, "amount_paid_cents": 0,
                    ]),
                line(
                    "il1", "invoice_line_item", ("invoice_id", "i1"),
                    [
                        "kind": "item", "description": "Leak detection", "quantity": 1, "unit_price_cents": 64900,
                        "taxable": false, "sort_order": 1,
                    ]),
            ]
        }
        try sync.store.applyPage(PullPage(rows: rows, done: true, cursor: [:], serverHLC: "1760000000005-0000-srv"))
    }

    /// A drawn stand-in for a pool photo on the skimmer seam, with markup and a caption.
    @MainActor
    func seedPhoto(_ sync: SyncService, job: String, componentId: String) throws {
        let size = CGSize(width: 1600, height: 1200)
        let image = UIGraphicsImageRenderer(size: size).image { context in
            UIColor(red: 0.62, green: 0.80, blue: 0.90, alpha: 1).setFill()
            context.fill(CGRect(origin: .zero, size: size))
            UIColor(red: 0.85, green: 0.82, blue: 0.75, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: size.width, height: 360))
            UIColor.white.setFill()
            context.fill(CGRect(x: 520, y: 260, width: 560, height: 220))
            UIColor(white: 0.25, alpha: 1).setFill()
            context.fill(CGRect(x: 600, y: 330, width: 400, height: 90))
        }
        let temp = FileManager.default.temporaryDirectory.appendingPathComponent("shot-\(UUID()).jpg")
        try #require(image.jpegData(compressionQuality: 0.7)).write(to: temp)
        let id = try MediaWrites.saveCapture(
            sync, companyId: "c1", target: MediaTarget(jobId: job, componentId: componentId),
            CapturedFile(
                kind: .photo, url: temp, mime: "image/jpeg", width: 1600, height: 1200,
                capturedAt: isoTimestamp(milliseconds: Date().timeIntervalSince1970 * 1000)),
            at: Coordinate(latitude: 33.4152, longitude: -111.8315))
        let media = try #require(jobMedia(sync.store, MediaTarget(jobId: job)).first { $0.id == id })
        try MediaWrites.setMarkup(
            sync, media,
            Markup(
                shapes: [
                    .circle(color: .red, cx: 0.5, cy: 0.31, rx: 0.2, ry: 0.12),
                    .arrow(color: .yellow, x1: 0.18, y1: 0.75, x2: 0.4, y2: 0.4),
                    .text(color: .white, x: 0.12, y: 0.82, text: "Crack"),
                    // A pen stroke (owner, 2026-10-19): freehand along the waterline.
                    penShape(
                        .red,
                        (0...60).map { i in
                            MarkupPoint(x: 0.58 + Double(i) * 0.006, y: 0.62 + 0.05 * sin(Double(i) / 6))
                        })!,
                ]))
        try MediaWrites.setCaption(sync, media, "Seam at the skimmer throat")
    }

    /// The company number, two conversations (one unread, with a customer), texts with a sent
    /// and a failed reply, and a voicemail.
    func seedMessages(_ store: LocalStore) throws -> (conversation: String, line: String) {
        let sam = try #require(try store.list("customer").first { $0["name"] == "Sam Sample" }?.id)
        try store.write("customer", id: sam, companyId: "c1", ["phone": "(602) 555-0188"])
        let day = { (offset: TimeInterval) in
            isoTimestamp(milliseconds: (Date().timeIntervalSince1970 + offset) * 1000)
        }
        let text = { (id: String, at: TimeInterval, dir: String, body: String, status: String) -> PulledRow in
            PulledRow(
                table: "text_message", xid: "5",
                row: [
                    "id": .string(id), "company_id": "c1", "conversation_id": "cv1", "created_at": .string(day(at)),
                    "direction": .string(dir), "body": .string(body), "media": [], "status": .string(status),
                    "sent_by": dir == "out" ? JSONValue.string("u1") : .null,
                ])
        }
        try store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "phone_line", xid: "5",
                        row: [
                            "id": "pl1", "company_id": "c1", "number": "+14805550100", "status": "active",
                            "pictures": true,
                        ]),
                    PulledRow(
                        table: "conversation", xid: "5",
                        row: [
                            "id": "cv1", "company_id": "c1", "phone": "+16025550188", "customer_id": .string(sam),
                            "last_at": .string(day(-600)),
                            "last_preview": "Wow, that was fast. How soon can you fix it?",
                            "unread": true, "opted_out": false,
                        ]),
                    PulledRow(
                        table: "conversation", xid: "5",
                        row: [
                            "id": "cv2", "company_id": "c1", "phone": "+14805550123",
                            "last_at": .string(day(-86_400 * 3)),
                            "last_preview": "Voicemail", "unread": false, "opted_out": false,
                        ]),
                    text(
                        "t1", -86_400 - 3600, "out", "Hi Sam, this is Dana from Demo Leak Co. We're on our way.",
                        "delivered"),
                    text("t2", -86_400 - 3000, "in", "Great, the gate is open.", "received"),
                    text(
                        "t3", -1200, "out", "We found the leak at the skimmer seam. The report is in your email.",
                        "delivered"),
                    text("t4", -900, "out", "Here's the quote for the repair.", "failed"),
                    text("t5", -600, "in", "Wow, that was fast. How soon can you fix it?", "received"),
                    PulledRow(
                        table: "call_log", xid: "5",
                        row: [
                            "id": "k1", "company_id": "c1", "conversation_id": "cv1",
                            "created_at": .string(day(-86_400)),
                            "direction": "in", "status": "voicemail", "duration_seconds": 42,
                            "recording_sid": "RE1", "transcript": "Hi, it's Sam. Call me back about the pool.",
                        ]),
                ], done: true, cursor: [:], serverHLC: "1760000000005-0000-srv"))
        return ("cv1", "pl1")
    }

    @MainActor
    func snapshot(
        _ name: String, dark: Bool = false, largeText: Bool = false, height: CGFloat? = nil,
        scrolled: CGFloat? = nil, liveMaps: Bool = false, keepsTitleFont: Bool = true,
        inspect: ((UIWindow) -> Void)? = nil, _ view: some View
    ) async throws {
        // The app's bar and tab styles (set once at launch in the app).
        Chrome.install()
        // Package tests run in a bare xctest host with no app scene. With a scene, draw the window on
        // screen; without one, lay the window out off screen and render its layers.
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let window =
            scene.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        if let scene { window.frame = scene.coordinateSpace.bounds }
        // A long screen in one picture (the job page with its tab).
        if let height { window.frame.size.height = height }
        window.overrideUserInterfaceStyle = dark ? .dark : .light
        // Glass can't be drawn off screen, so screenshots show the flat look of iOS 18 to 25.
        let content = view.environment(\.dynamicTypeSize, largeText ? .accessibility2 : .large)
            .environment(\.drawsGlass, false)
            .environment(\.drawsLiveMaps, liveMaps)
            .environment(\.keepsTitleFont, keepsTitleFont)
        window.rootViewController = UIHostingController(rootView: content)
        window.makeKeyAndVisible()
        // Let SwiftUI load data (.task) and settle, then lay out once more.
        for _ in 0..<12 {
            try await Task.sleep(for: .milliseconds(100))
            window.layoutIfNeeded()
        }
        // Scrolled down the page by `scrolled` points (the tab bar's logo collapsing to its mark).
        if let scrolled, let scroll = pageScrollView(in: window) {
            scroll.setContentOffset(
                CGPoint(x: scroll.contentOffset.x, y: scroll.contentOffset.y + scrolled), animated: false)
            for _ in 0..<6 {
                try await Task.sleep(for: .milliseconds(100))
                window.layoutIfNeeded()
            }
        }
        inspect?(window)
        // A live map can't be drawn into a picture reliably: MapKit frees its tile images while
        // they're being drawn and the test host crashes (CI, 2026-10-22). Live-map runs only
        // inspect the window.
        if liveMaps {
            window.isHidden = true
            return
        }
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { context in
            if scene != nil {
                window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
            } else {
                window.layer.render(in: context.cgContext)
            }
        }
        window.isHidden = true
        let png = try #require(image.pngData())
        if let folder = ProcessInfo.processInfo.environment["SCREENSHOT_DIR"], !folder.isEmpty {
            try FileManager.default.createDirectory(atPath: folder, withIntermediateDirectories: true)
            try png.write(to: URL(fileURLWithPath: folder).appendingPathComponent("\(name).png"))
        }
        // A blank picture means nothing was drawn.
        #expect(!isBlank(image), "\(name) rendered blank")
    }

    /// The fonts of the navigation bar's labels that read `title` (its large and small titles).
    @MainActor
    func barTitleFonts(_ title: String, in root: UIView) -> [String] {
        var fonts: [String] = []
        func walk(_ view: UIView, inBar: Bool) {
            let bar = inBar || view is UINavigationBar
            if bar, let label = view as? UILabel, label.text == title || label.attributedText?.string == title {
                fonts.append(label.font.fontName)
            }
            for child in view.subviews { walk(child, inBar: bar) }
        }
        walk(root, inBar: false)
        return fonts
    }

    /// The page's vertical scroll view: the widest one that scrolls up and down.
    @MainActor
    func pageScrollView(in root: UIView) -> UIScrollView? {
        let width = root.bounds.width - 1
        var found: [UIScrollView] = []
        func walk(_ view: UIView) {
            if let scroll = view as? UIScrollView, scroll.bounds.width >= width,
                scroll.contentSize.height > scroll.bounds.height - scroll.adjustedContentInset.top
            {
                found.append(scroll)
            }
            view.subviews.forEach(walk)
        }
        walk(root)
        return found.first
    }

    /// Whether every sampled pixel has the same color. Walks rows by bytesPerRow: rows are padded,
    /// and reading the padding as pixels made blank pictures look drawn.
    @MainActor
    func isBlank(_ image: UIImage) -> Bool {
        guard let cg = image.cgImage, let data = cg.dataProvider?.data, let bytes = CFDataGetBytePtr(data) else {
            return true
        }
        let pixelBytes = max(1, cg.bitsPerPixel / 8)
        var first: [UInt8]?
        for y in stride(from: 0, to: cg.height, by: max(1, cg.height / 64)) {
            for x in stride(from: 0, to: cg.width, by: max(1, cg.width / 64)) {
                let offset = y * cg.bytesPerRow + x * pixelBytes
                let pixel = (0..<min(pixelBytes, 3)).map { bytes[offset + $0] }
                if let first, first != pixel { return false }
                first = first ?? pixel
            }
        }
        return true
    }

    extension View {
        @MainActor func app(_ environment: AppEnvironment) -> some View {
            self.environment(environment.session).environment(environment.session.sync).environment(environment)
        }
    }

    @Suite(.serialized) @MainActor struct ScreenshotTests {
        @Test func signIn() async throws {
            let env = try sampleEnvironment(signedIn: false)
            try await snapshot("01-sign-in", SignInFlow().app(env))
            try await snapshot("01-sign-in-dark", dark: true, SignInFlow().app(env))
        }

        @Test func jobs() async throws {
            let env = try sampleEnvironment()
            try await snapshot("02-jobs", NavigationStack { JobsView() }.app(env))
            try await snapshot("02-jobs-dark", dark: true, NavigationStack { JobsView() }.app(env))
            try await snapshot("02-jobs-large-text", largeText: true, NavigationStack { JobsView() }.app(env))
        }

        /// The tab pages' bar (owner, 2026-10-21): at rest, the Sundeck Pro lockup on the bar's
        /// leading edge under the status bar, the sort and "+" buttons in the same row, the large
        /// title under the bar; scrolled, the title in the bar and only the pin mark kept.
        @Test func tabBarLogo() async throws {
            let env = try sampleEnvironment()
            try seedRoute(env.session.sync.store)
            env.session.reloadCompanies()
            func jobs() -> some View { NavigationStack { JobsView() }.environment(\.brandInBar, true).app(env) }
            try await snapshot("tab-bar-logo-rest-jobs", jobs())
            try await snapshot("tab-bar-logo-rest-jobs-dark", dark: true, jobs())
            try await snapshot("tab-bar-logo-scrolled-jobs", scrolled: 160, jobs())
            try await snapshot("tab-bar-logo-scrolled-jobs-dark", dark: true, scrolled: 160, jobs())
            try await snapshot("tab-bar-logo-rest-jobs-large-text", largeText: true, jobs())
            try await snapshot("tab-bar-logo-rest-today", MainView().app(env))
            try await snapshot("tab-bar-logo-rest-today-dark", dark: true, MainView().app(env))
            try await snapshot("tab-bar-logo-scrolled-today", scrolled: 160, MainView().app(env))
            try await snapshot("tab-bar-logo-scrolled-today-dark", dark: true, scrolled: 160, MainView().app(env))
        }

        @Test func emptyJobs() async throws {
            let env = try sampleEnvironment(jobs: false)
            try await snapshot("03-jobs-empty", NavigationStack { JobsView() }.app(env))
        }

        @Test func today() async throws {
            let env = try sampleEnvironment()
            try seedRoute(env.session.sync.store)
            env.session.reloadCompanies()
            try await snapshot("30-today", height: 1500, MainView().app(env))
            try await snapshot("30-today-dark", dark: true, height: 1500, MainView().app(env))
            // Mark Complete (owner, 2026-10-19): the first stop done for the day, so the second is
            // the one you're on, open and ringed; the rest are one row each.
            let store = env.session.sync.store
            if let first = try store.list("job").filter({ $0["type"]?.string != "maintenance" })
                .min(by: { ($0["scheduled_start"]?.string ?? "") < ($1["scheduled_start"]?.string ?? "") })
            {
                let today = try localDate(Date(), env.session.company?.timeZone ?? "America/Phoenix")
                try store.write("job", id: first.id, companyId: "c1", ["stop_done_on": .string(today)])
            }
            try await snapshot("30-today-marked", height: 1500, MainView().app(env))
            // Reorder (owner, 2026-10-22): Reorder and Done in the bar, no Move Up / Move Down,
            // and the logo's wordmark folding away as the list scrolls.
            func reorder() -> some View { MainView().environment(\.todayStartsReordering, true).app(env) }
            try await snapshot("30-today-reorder", reorder())
            try await snapshot("30-today-reorder-scrolled", scrolled: 160, reorder())
            let empty = try sampleEnvironment(jobs: false)
            try await snapshot("30-today-empty", MainView().app(empty))
        }

        /// Filter and salt cell cleanings (owner, 2026-10-19): a maintenance stop on Today with
        /// both on its checklist (icon and "Today" only), and that visit's Checklist with
        /// Regular cleanings, also in Edit.
        @Test func cleanings() async throws {
            let env = try sampleEnvironment()
            let store = env.session.sync.store
            try seedRoute(store)
            env.session.reloadCompanies()
            let visit = try #require(try seedCleanings(store))
            try await snapshot("30-today-cleanings", height: 1500, MainView().app(env))
            try await snapshot("30-today-cleanings-dark", dark: true, height: 1500, MainView().app(env))
            // Just the icon and how soon, muted; access notes a plain line with a key.
            try await snapshot("30-today-cleanings-large-text", largeText: true, height: 2400, MainView().app(env))
            // The visit's checklist in Edit: a cleaning's Remove says it goes on the next visit.
            // Chemical opened in place on the visit's Checklist (owner, 2026-10-19).
            let pool = try #require(try store.get("job", visit)?["property_id"]?.string)
            try await snapshot(
                "30-checklist-chemical-open", height: 2600,
                ScrollView {
                    ChemicalCard(target: ChemicalTarget(propertyId: pool, jobId: visit), open: true).padding(16)
                }
                .background(Color.bg).app(env))
            try await snapshot(
                "30-checklist-chemical-open-dark", dark: true, height: 2600,
                ScrollView {
                    ChemicalCard(target: ChemicalTarget(propertyId: pool, jobId: visit), open: true).padding(16)
                }
                .background(Color.bg).app(env))
            try await snapshot(
                "30-checklist-cleanings-edit", height: 2400,
                NavigationStack { JobScreen(jobId: visit, section: .checklist, checklistEditing: true) }.app(env))
            try await snapshot(
                "30-checklist-cleanings", height: 2400,
                NavigationStack { JobScreen(jobId: visit, section: .checklist) }.app(env))
        }

        @Test func schedule() async throws {
            let env = try sampleEnvironment()
            try seedRoute(env.session.sync.store)
            env.session.reloadCompanies()
            try await snapshot("31-schedule-day", height: 1800, NavigationStack { ScheduleScreen() }.app(env))
            try await snapshot(
                "32-schedule-week", height: 1800, NavigationStack { ScheduleScreen(view: .week) }.app(env))
            try await snapshot(
                "33-schedule-month", NavigationStack { ScheduleScreen(view: .month) }.app(env))
        }

        /// With the real Day map drawn, "Schedule" stays in Barlow (owner, 2026-10-21: "The map
        /// opening should not change it"). The first picture, without `TitleFontKeeper`, records
        /// what the bar does on its own.
        @Test func scheduleTitleWithMap() async throws {
            let env = try sampleEnvironment()
            try seedRoute(env.session.sync.store)
            env.session.reloadCompanies()
            UserDefaults.standard.set(true, forKey: "schedule.dayMapOpen")
            var without: [String] = []
            try await snapshot(
                "31-schedule-map-no-keeper", liveMaps: true, keepsTitleFont: false,
                inspect: { without = barTitleFonts("Schedule", in: $0) },
                NavigationStack { ScheduleScreen() }.app(env))
            print("Schedule title fonts without the keeper: \(without)")
            var with: [String] = []
            try await snapshot(
                "31-schedule-map", liveMaps: true,
                inspect: { with = barTitleFonts("Schedule", in: $0) },
                NavigationStack { ScheduleScreen() }.app(env))
            print("Schedule title fonts with the keeper: \(with)")
            #expect(!with.isEmpty, "no Schedule title in the bar")
            #expect(with.allSatisfy { $0.contains("Barlow") }, "Schedule title fonts: \(with)")
        }

        @Test func job() async throws {
            let env = try sampleEnvironment()
            let id = try #require(env.session.sync.store.list("job").first { $0["number"] == 1042 }?.id)
            // A customer link that was opened, so Details shows Customer links. The server makes
            // links, so it arrives as a sync would bring it.
            let now = Date().timeIntervalSince1970 * 1000
            try env.session.sync.store.applyPage(
                PullPage(
                    rows: [
                        PulledRow(
                            table: "share_link", xid: "9",
                            row: [
                                "id": "sl-shot", "company_id": "c1", "job_id": .string(id), "report_id": "r-shot",
                                "token": "tok-shot", "view_count": 2,
                                "created_at": .string(isoTimestamp(milliseconds: now - 86_400_000)),
                                "last_viewed_at": .string(isoTimestamp(milliseconds: now)),
                                "expires_at": .string(isoTimestamp(milliseconds: now + 180 * 86_400_000)),
                            ])
                    ], done: true, cursor: [:], serverHLC: "1760000000009-0000-srv"))
            try await snapshot("04-job", height: 2200, NavigationStack { JobScreen(jobId: id) }.app(env))
            try await snapshot(
                "04-job-dark", dark: true, height: 2200, NavigationStack { JobScreen(jobId: id) }.app(env))
        }

        @Test func inspection() async throws {
            let env = try sampleEnvironment()
            let ids = try seedInspection(env)
            try await snapshot(
                "09-checklist", height: 3000,
                NavigationStack { JobScreen(jobId: ids.job, section: .checklist) }.app(env))
            try await snapshot(
                "09-checklist-dark", dark: true, height: 3000,
                NavigationStack { JobScreen(jobId: ids.job, section: .checklist) }.app(env))
            // Edit (owner, 2026-10-19): every section open, a red Remove on every item.
            try await snapshot(
                "09-checklist-edit", height: 3600,
                NavigationStack { JobScreen(jobId: ids.job, section: .checklist, checklistEditing: true) }.app(env))
            try await snapshot(
                "09-checklist-edit-dark", dark: true, height: 3600,
                NavigationStack { JobScreen(jobId: ids.job, section: .checklist, checklistEditing: true) }.app(env))
            // Tests and findings together, as on the website.
            try await snapshot(
                "10-findings", height: 1800, NavigationStack { JobScreen(jobId: ids.job, section: .findings) }.app(env))
            try await snapshot(
                "11-findings-dark", dark: true, height: 1800,
                NavigationStack { JobScreen(jobId: ids.job, section: .findings) }.app(env))
            // The pool's layout (owner, 2026-10-19): a mirrored Figure 8 with a large square spa
            // placed at the bottom right.
            let store = env.session.sync.store
            let propertyId = try #require(store.get("job", ids.job)?["property_id"]?.string)
            try store.write(
                "property", id: propertyId, companyId: "c1",
                [
                    "diagram_shape": "figure_eight",
                    "diagram_layout": [
                        "mirror": true, "spa": ["x": 0.85, "y": 0.75, "size": "large", "shape": "square", "r": 19],
                        // Drawn with Draw, and landmarks around it (owner, 2026-10-19).
                        "drawing": [["type": "line", "x1": 0.06, "y1": 0.94, "x2": 0.6, "y2": 0.94]],
                        "landmarks": [
                            ["kind": "tree", "x": 0.06, "y": 0.1], ["kind": "equipment", "x": 0.94, "y": 0.1],
                            ["kind": "waterfall", "x": 0.5, "y": 0.08],
                        ],
                    ],
                ])
            try await snapshot(
                "10-findings-layout", height: 1800,
                NavigationStack { JobScreen(jobId: ids.job, section: .findings) }.app(env))
            // Edit Pool Shape (owner, 2026-10-19): the sheet as the property is now (a mirrored
            // Figure 8, a large square spa placed by hand, a drawn line and three landmarks), in
            // light, dark and large text.
            let shapeForm = PoolShapeForm(property: try store.get("property", propertyId))
            try await snapshot(
                "10-pool-shape", height: 1900,
                PoolShapeSheet(propertyId: propertyId, companyId: "c1", form: shapeForm).app(env))
            try await snapshot(
                "10-pool-shape-dark", dark: true, height: 1900,
                PoolShapeSheet(propertyId: propertyId, companyId: "c1", form: shapeForm).app(env))
            try await snapshot(
                "10-pool-shape-large-text", largeText: true, height: 2600,
                PoolShapeSheet(propertyId: propertyId, companyId: "c1", form: shapeForm).app(env))
            // Draw and Landmarks open under the tiles.
            try await snapshot(
                "10-pool-shape-draw", height: 2000,
                PoolShapeSheet(propertyId: propertyId, companyId: "c1", form: shapeForm, panel: .draw).app(env))
            try await snapshot(
                "10-pool-shape-landmarks", height: 2000,
                PoolShapeSheet(propertyId: propertyId, companyId: "c1", form: shapeForm, panel: .landmarks).app(env))
            // A landmark selected (owner, 2026-10-19): dashed ring, the X to delete, the resize
            // handle; the waterfall drawn larger and flipped.
            var sized = shapeForm
            sized.setLandmarkSize(2, 30)
            sized.flipLandmark(2)
            try await snapshot(
                "10-pool-shape-landmark-selected", height: 2000,
                PoolShapeSheet(
                    propertyId: propertyId, companyId: "c1", form: sized, panel: .landmarks, selected: 2
                ).app(env))
            // Markup on the diagram (owner, 2026-10-19): a pen ring round the pin and an arrow.
            let ring = (0...40).map { i in
                MarkupPoint(x: 0.18 + 0.08 * cos(Double(i) / 6.4), y: 0.12 + 0.12 * sin(Double(i) / 6.4))
            }
            let diagramMarkup = Markup(shapes: [
                penShape(.red, ring)!, .arrow(color: .yellow, x1: 0.5, y1: 0.75, x2: 0.3, y2: 0.3),
                .text(color: .white, x: 0.55, y: 0.85, text: "Leak"),
            ])
            try InspectionWrites.setDiagramMarkup(env.session.sync, jobId: ids.job, companyId: "c1", diagramMarkup)
            try await snapshot(
                "10-findings-markup", height: 1800,
                NavigationStack { JobScreen(jobId: ids.job, section: .findings) }.app(env))
            let markedProperty = try #require(try store.get("property", propertyId))
            try await snapshot(
                "10-diagram-markup-editor",
                DiagramMarkupEditor(
                    jobId: ids.job, companyId: "c1", property: markedProperty,
                    pins: findingPins(
                        JobInspection(store, jobId: ids.job), InspectionConfig(store, companyId: "c1")),
                    saved: diagramMarkup.shapes
                )
                .app(env))
            try await snapshot(
                "12-component", height: 2000,
                NavigationStack { ComponentScreen(jobId: ids.job, componentId: ids.seam) }.app(env))
            try await snapshot(
                "13-test-editor",
                TestEditor(jobId: ids.job, testId: ids.test, typeId: nil, componentId: nil).app(env))
            try await snapshot(
                "13-test-editor-new", TestEditor(jobId: ids.job, testId: nil, typeId: nil, componentId: nil).app(env))
            try await snapshot(
                "14-finding-editor", height: 2000,
                FindingEditor(jobId: ids.job, findingId: ids.finding, componentId: nil).app(env))
            try await snapshot(
                "14-finding-editor-large-text", largeText: true,
                FindingEditor(jobId: ids.job, findingId: ids.finding, componentId: nil).app(env))
            try await snapshot(
                "16-report", height: 2400, NavigationStack { JobScreen(jobId: ids.job, section: .wrapUp) }.app(env))
            try await snapshot("17-review", height: 2600, NavigationStack { ReviewScreen(jobId: ids.job) }.app(env))
            // Tests we ran (owner, 2026-10-19): every test, with a second one recorded without an
            // outcome ("Recorded").
            let types = InspectionConfig(env.session.sync.store, companyId: "c1")
            let pressure = try #require(types.testTypes.first { $0.key == "pressure" })
            let data = normalizeTestData(
                pressure.fieldSchema,
                ["line_name": "Main drain", "start_psi": "20", "end_psi": "20", "duration_min": "15"].mapValues {
                    .string($0)
                })
            _ = try InspectionWrites.saveTest(
                env.session.sync, companyId: "c1", jobId: ids.job, existing: nil, type: pressure, componentId: nil,
                data: data, outcome: nil, notes: "")
            try await snapshot(
                "17-review-tests", height: 2800, NavigationStack { ReviewScreen(jobId: ids.job) }.app(env))
            try await snapshot(
                "17-review-tests-dark", dark: true, height: 2800,
                NavigationStack { ReviewScreen(jobId: ids.job) }.app(env))
            try await snapshot(
                "18-signature", NavigationStack { SignatureScreen(jobId: ids.job, quoteId: nil) }.app(env))
            let photo = try #require(jobMedia(env.session.sync.store, MediaTarget(jobId: ids.job)).first?.id)
            try await snapshot(
                "15-media", NavigationStack { MediaScreen(jobId: ids.job, mediaId: photo) }.app(env))
            try await snapshot(
                "15-media-dark", dark: true,
                NavigationStack { MediaScreen(jobId: ids.job, mediaId: photo) }.app(env))
            // Mark Up with Pen first and selected, over the photo's markup (pen stroke included).
            let media = try #require(jobMedia(env.session.sync.store, MediaTarget(jobId: ids.job)).first)
            let file = try #require(env.session.sync.media?.localURL(media.id, mime: media.mimeType))
            try await snapshot("15-markup-pen", MarkupEditor(media: media, url: file).app(env))
            try await snapshot("15-markup-pen-dark", dark: true, MarkupEditor(media: media, url: file).app(env))
        }

        @Test func designGallery() async throws {
            try await snapshot("00-design-gallery", height: 5200, DesignGallery())
            try await snapshot("00-design-gallery-dark", dark: true, height: 5200, DesignGallery())
        }

        @Test func settings() async throws {
            let env = try sampleEnvironment()
            try await snapshot("05-settings", height: 1400, NavigationStack { ShopSettingsScreen() }.app(env))
            _ = try seedInspection(env)
            try await snapshot(
                "49-settings-price-book", height: 1400,
                NavigationStack { SettingsListScreen(page: .priceBook) }.app(env))
            // Settings › Team with Completing a job (owners and admins, 2026-10-19).
            try await snapshot(
                "49-settings-team", height: 1600, NavigationStack { SettingsListScreen(page: .team) }.app(env))
            // The Checklist segmented control at the top of a list, not clipped (owner, 2026-10-22).
            try await snapshot(
                "49-settings-components", height: 1400,
                NavigationStack { SettingsListScreen(page: .components) }.app(env))
            // Company and Branding: one Save floating at the bottom (owner, 2026-10-22), and the
            // accent's More colors without slate or red (six), slate kept first for a shop on it.
            try env.session.sync.store.write(
                "company", id: "c1", companyId: "c1", ["brand_primary": "#1D5FA8", "brand_secondary": "#3C4450"])
            // (68-settings-company has the whole page.)
            try await snapshot(
                "49-settings-company-branding", height: 1400, scrolled: 1100,
                NavigationStack { CompanySettingsScreen() }.app(env))
            try await snapshot(
                "49-settings-company-dark", dark: true, height: 1400, scrolled: 1100,
                NavigationStack { CompanySettingsScreen() }.app(env))
        }

        @Test func code() async throws {
            let env = try sampleEnvironment()
            try await snapshot("07-code", CodeView().app(env))
        }

        @Test func newJob() async throws {
            let env = try sampleEnvironment()
            let company = try #require(env.session.company)
            try await snapshot(
                "08-new-job", height: 2600,
                NavigationStack {
                    NewJobView(form: NewJobForm(sync: env.session.sync, company: company, userId: "u1"), back: "Jobs") {
                        _ in
                    }
                }
                .app(env))
            // From the Customer on a repair (owner, 2026-10-19): two items picked for the menu, one
            // chosen (its price filled in) and what the customer said.
            let store = env.session.sync.store
            try store.applyPage(
                PullPage(
                    rows: [("pb-pump", "Pump motor", 45000), ("pb-heater", "Heater igniter", 18500)].enumerated().map {
                        i, p in
                        PulledRow(
                            table: "price_book_item", xid: "7",
                            row: [
                                "id": .string(p.0), "company_id": "c1", "name": .string(p.1), "category": "Repair",
                                "unit": "each", "price_cents": .number(Double(p.2)), "taxable": true,
                                "sort_order": .number(Double(i)), "active": true, "on_repair_call": true,
                            ])
                    }, done: true, cursor: [:], serverHLC: "1760000000007-0000-srv"))
            let repair = NewJobForm(sync: env.session.sync, company: company, userId: "u1")
            repair.jobType = .repair
            repair.jobTypeChanged()
            // Two repairs (owner, 2026-10-22: "add additional repair").
            if let first = repair.repairItems.first {
                repair.chooseRepair(repair.repairs[0].id, pick: first.id)
            }
            repair.addAdditionalRepair()
            if let second = repair.repairItems.dropFirst().first, let entry = repair.repairs.last {
                repair.chooseRepair(entry.id, pick: second.id)
            }
            repair.notes = "Pump hums but won't start. Breaker trips after a minute."
            try await snapshot(
                "08-new-job-repair", height: 2600,
                NavigationStack { NewJobView(form: repair, back: "Jobs") { _ in } }.app(env))
            // The job page: "From the Customer" · What they need.
            let sam = try #require(try store.list("job").first { $0["type"] == "repair" })
            try store.write(
                "job", id: sam.id, companyId: "c1", ["intake": [repairItemKey: "Pump motor"], "fee_cents": 45000])
            try await snapshot(
                "08-repair-job-called", height: 1800,
                NavigationStack { JobScreen(jobId: sam.id, section: .details) }.app(env))
        }

        /// The job's Photos and Wrap-Up sections (spec 5.4) on the sample job: a marked-up photo,
        /// the draft report, a draft quote with lines, and a draft invoice; then a sent and accepted
        /// quote with a sent invoice as an owner sees them.
        @Test func photosAndWrapUp() async throws {
            let env = try sampleEnvironment()
            let ids = try seedInspection(env)
            try seedMoney(env.session.sync, job: ids.job, finding: ids.finding)
            let job = try #require(try jobViews(env.session.sync.store, companyId: "c1").first { $0.id == ids.job })
            func page(_ content: some View) -> some View {
                NavigationStack { ScreenScroll { content }.navigationTitle("Job #1042") }.app(env)
            }
            try await snapshot("19-photos", height: 1800, page(JobPhotosSection(job: job)))
            try await snapshot("19-photos-dark", dark: true, height: 1800, page(JobPhotosSection(job: job)))
            // The finish list (owner, 2026-10-22, option A), then each step's sheet.
            try await snapshot("20-wrap-up", height: 1400, page(WrapUpSection(job: job)))
            try await snapshot("20-wrap-up-dark", dark: true, height: 1400, page(WrapUpSection(job: job)))
            try await snapshot("20-wrap-up-large-text", largeText: true, height: 2400, page(WrapUpSection(job: job)))
            let store = env.session.sync.store
            let list = wrapUp(wrapUpInput(store: store, companyId: "c1", settings: nil, job: job))
            let quote = jobQuotes(store, companyId: "c1", jobId: job.id).first?.id
            for (name, step) in [
                ("report", WrapUpOpen(step: .report, refId: nil)), ("quote", WrapUpOpen(step: .quote, refId: quote)),
                ("sign", WrapUpOpen(step: .sign, refId: nil)), ("invoice", WrapUpOpen(step: .invoice, refId: nil)),
            ] {
                try await snapshot(
                    "20-wrap-up-\(name)", height: 3600,
                    WrapUpStepSheet(job: job, step: step, title: step.title(list)).app(env))
            }

            let sent = try sampleEnvironment()
            let sentIds = try seedInspection(sent)
            try seedMoney(sent.session.sync, job: sentIds.job, finding: sentIds.finding, sent: true)
            let sentJob = try #require(
                try jobViews(sent.session.sync.store, companyId: "c1").first { $0.id == sentIds.job })
            try await snapshot(
                "21-wrap-up-sent", height: 1400,
                NavigationStack { ScreenScroll { WrapUpSection(job: sentJob) }.navigationTitle("Job #1042") }
                    .app(sent))
            try await snapshot(
                "21-wrap-up-sent-invoice", height: 2400,
                WrapUpStepSheet(job: sentJob, step: WrapUpOpen(step: .invoice, refId: nil), title: "Invoice").app(sent))
            // Next Step bar on Wrap-Up: the next step's action above the tab bar.
            try await snapshot(
                "21-wrap-up-bar", height: 1400,
                NavigationStack { JobScreen(jobId: sentIds.job, section: .wrapUp) }.app(sent))
        }

        // MARK: Messages and More (spec 5.7 to 5.13, 6.6)

        @Test func messages() async throws {
            let env = try sampleEnvironment()
            let ids = try seedMessages(env.session.sync.store)
            try await snapshot("40-messages", NavigationStack { MessagesScreen() }.app(env))
            try await snapshot("40-messages-dark", dark: true, NavigationStack { MessagesScreen() }.app(env))
            try await snapshot(
                "41-conversation", height: 1400,
                NavigationStack { ConversationScreen(conversationId: ids.conversation) }.app(env))
            try await snapshot(
                "41-conversation-dark", dark: true, height: 1400,
                NavigationStack { ConversationScreen(conversationId: ids.conversation) }.app(env))
            try await snapshot("42-new-message", NavigationStack { NewMessageScreen(customerId: nil) }.app(env))
        }

        @Test func more() async throws {
            let env = try sampleEnvironment()
            try await snapshot(
                "43-more-owner", height: 2000, NavigationStack { MoreScreen(showReauth: {}) }.app(env))
            try await snapshot(
                "43-more-owner-dark", dark: true, height: 2000,
                NavigationStack { MoreScreen(showReauth: {}) }.app(env))
            let tech = try sampleEnvironment()
            try tech.session.sync.store.applyPage(
                PullPage(
                    rows: [
                        PulledRow(
                            table: "membership", xid: "9",
                            row: [
                                "id": "m1", "company_id": "c1", "user_id": "u1", "role": "tech", "status": "active",
                            ])
                    ], done: true, cursor: [:], serverHLC: "1760000000009-0000-srv"))
            tech.session.reloadCompanies()
            try await snapshot(
                "43-more-tech", height: 2000, NavigationStack { MoreScreen(showReauth: {}) }.app(tech))
            try await snapshot("48-sync", NavigationStack { SettingsView(showReauth: {}) }.app(env))
        }

        @Test func customers() async throws {
            let env = try sampleEnvironment()
            try await snapshot("44-customers", NavigationStack { CustomersScreen() }.app(env))
            // The search field and Sort and Show, whole: not clipped by the list (owner, 2026-10-22).
            try await snapshot("44-customers-dark", dark: true, NavigationStack { CustomersScreen() }.app(env))
            let maria = try #require(
                try env.session.sync.store.list("customer").first { $0["name"] == "Maria Alvarez" }?.id)
            try await snapshot(
                "45-customer", height: 1600, NavigationStack { CustomerScreen(customerId: maria) }.app(env))
            // Pool Details with Gallons (owner, 2026-10-19).
            let detail = try #require(
                customerDetail(
                    env.session.sync.store, companyId: "c1", customerId: maria, timeZone: "America/Phoenix"))
            let pool = try #require(detail.pools.first)
            try await snapshot(
                "45-pool-details", height: 1400, PoolSheet(propertyId: pool.id, row: pool.row, saved: {}).app(env))
        }

        /// Maintenance plans (spec 5.5 and 5.9): a customer's plan on their page, the plan sheet,
        /// and New Job starting a plan for a pool shop.
        @Test func maintenancePlans() async throws {
            let env = try sampleEnvironment()
            let store = env.session.sync.store
            let maria = try #require(try store.list("customer").first { $0["name"] == "Maria Alvarez" }?.id)
            let pool = try #require(try store.list("property").first { $0["customer_id"] == .string(maria) }?.id)
            let starts = localDay(Date().addingTimeInterval(86_400), timeZone: "America/Phoenix")
            try store.applyPage(
                PullPage(
                    rows: [
                        PulledRow(
                            table: "service_plan", xid: "2",
                            row: [
                                "id": "sp1", "company_id": "c1", "customer_id": .string(maria),
                                "property_id": .string(pool), "assigned_user_id": "u2", "starts_on": .string(starts),
                                "interval_weeks": 1, "weekdays": nil, "monthly": false, "visit_time": "10:00:00",
                                "duration_minutes": 45, "price_cents": 18000, "ends_on": nil, "paused": false,
                                "notes": "Brush the steps.", "deleted_at": nil,
                            ])
                    ], done: true, cursor: [:], serverHLC: "1760000000001-0000-srv"))
            try await snapshot(
                "49-customer-plans", height: 1800, NavigationStack { CustomerScreen(customerId: maria) }.app(env))
            let detail = try #require(
                customerDetail(store, companyId: "c1", customerId: maria, timeZone: "America/Phoenix"))
            let plan = try #require(detail.pools.first?.plans.first)
            try await snapshot(
                "50-plan-sheet", height: 1500,
                PlanSheet(customerId: maria, propertyId: pool, plan: plan, saved: { _ in }).app(env))

            let company = CompanyContext(
                id: "c1", name: "Demo Leak Co.", timeZone: "America/Phoenix", settings: ["services": "pool"],
                role: "owner")
            let form = NewJobForm(sync: env.session.sync, company: company, userId: "u1")
            form.repeatChoice = .days
            form.plan.days = [1, 4]
            try await snapshot(
                "51-new-plan", height: 2400,
                NavigationStack { NewJobView(form: form, back: "Jobs") { _ in } }.app(env))
        }

        @Test func invoices() async throws {
            let env = try sampleEnvironment()
            let ids = try seedInspection(env)
            try seedMoney(env.session.sync, job: ids.job, finding: ids.finding, sent: true)
            try await snapshot("46-invoices", NavigationStack { InvoicesScreen() }.app(env))
        }

        @Test func chemicals() async throws {
            let env = try sampleEnvironment()
            try await snapshot(
                "47-chemicals", height: 1500, NavigationStack { ChemicalsScreen(gallons: 18000) }.app(env))
            // Opened from Sam's maintenance visit (owner, 2026-10-19): Submit under the readings and
            // the pool's chemical log, two entries submitted on this phone.
            let store = env.session.sync.store
            let visit = try #require(try store.list("job").first { $0["number"] == 1043 })
            let target = ChemicalTarget(
                propertyId: try #require(visit["property_id"]?.string), jobId: visit.id)
            let pool = try #require(chemicalPool(store, target))
            var form = ChemicalForm(gallons: 18000)
            form.readings = [.fc: "3", .ph: "7.6", .ta: "90"]
            try ChemicalLogWrites.submit(
                env.session.sync, companyId: "c1", pool: pool, form: form, now: Date().addingTimeInterval(-7 * 86400))
            form.readings = [.fc: "1.5", .ph: "7.9", .ta: "80", .cya: "40", .salt: "3200"]
            try ChemicalLogWrites.submit(env.session.sync, companyId: "c1", pool: pool, form: form)
            try await snapshot(
                "47-chemicals-pool", height: 2200, NavigationStack { ChemicalsScreen(target: target) }.app(env))
            try await snapshot(
                "47-chemicals-pool-dark", dark: true, height: 2200,
                NavigationStack { ChemicalsScreen(target: target) }.app(env))
            try await snapshot(
                "47-checklist-chemical", height: 1600,
                NavigationStack { JobScreen(jobId: visit.id, section: .checklist) }.app(env))
            // "Take a pool photo first" (owner, 2026-10-19): Complete Job, at the end of the
            // visit's Checklist, stopped with no photo, with Take Photo.
            try store.write("job", id: visit.id, companyId: "c1", ["status": "in_progress"])
            try await snapshot(
                "47-visit-photo-needed", height: 2600,
                NavigationStack { JobScreen(jobId: visit.id, section: .checklist, photoNeeded: true) }.app(env))
            try await snapshot(
                "47-visit-photo-needed-dark", dark: true, height: 2600,
                NavigationStack { JobScreen(jobId: visit.id, section: .checklist, photoNeeded: true) }.app(env))
            // Done: the visit report on the Next Step bar (owner, 2026-10-22: "really buried").
            try store.write("job", id: visit.id, companyId: "c1", ["status": "done"])
            try await snapshot(
                "47-visit-report-bar", height: 1600,
                NavigationStack { JobScreen(jobId: visit.id, section: .details) }.app(env))
            try store.write("job", id: visit.id, companyId: "c1", ["status": "in_progress"])
            let sam = try #require(try store.list("customer").first { $0["name"] == "Sam Sample" }?.id)
            try await snapshot(
                "47-customer-chemical", height: 1800, NavigationStack { CustomerScreen(customerId: sam) }.app(env))
            try await snapshot(
                "47-chemicals-doses", height: 1200,
                FormSheet(title: "What to Add", cancelTitle: "Close") {
                    DoseList(
                        result: calculateChemistry(
                            ChemistryInput(
                                gallons: 18000, readings: Readings(fc: 1.5, ph: 7.9, ta: 90, ch: 250, cya: 40),
                                chlorine: .liquid12, acid: .muriatic31)))
                }
                .app(env))
        }
    }
#endif
