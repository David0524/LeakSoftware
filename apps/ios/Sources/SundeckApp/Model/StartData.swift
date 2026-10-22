import Foundation
import SundeckCore
import SundeckSync

/// What the shop has done so far, from its rows on the phone (Getting Started on Today). Invites
/// and the Stripe account aren't synced, so they come from the server. Port of the counts in
/// apps/mobile/src/features/today/GettingStarted.tsx.
public func shopProgress(_ store: LocalStore, company: CompanyContext, invites: Int, payments: Bool)
    -> ShopProgress
{
    func rows(_ table: String) -> [Row] {
        ((try? store.list(table, companyId: company.id)) ?? []).filter { $0["deleted_at"]?.string == nil }
    }
    let active = rows("membership").filter { $0["status"]?.string == "active" }.count
    let logo = (try? store.get("company", company.id))??["logo_path"]?.string ?? ""
    // The sample job (owner, 2026-10-22) is never counted: its job, made-up customer and report.
    let allJobs = (try? store.list("job", companyId: company.id)) ?? []
    let sample = allJobs.first { $0["sample"]?.bool == true }
    let sampleId = sample?["id"]?.string
    let sampleLive = sample.flatMap { $0["deleted_at"]?.string == nil ? $0 : nil }
    let sampleCustomer = sampleLive?["bill_to_customer_id"]?.string
    let sampleSent =
        ((try? store.list("message", companyId: company.id)) ?? []).contains {
            $0["job_id"]?.string == sampleId && $0["channel"]?.string == "email" && $0["status"]?.string == "sent"
        }
    return ShopProgress(
        people: max(active, 1),
        openInvites: invites,
        hasLogo: !logo.isEmpty,
        paymentsReady: payments,
        customers: rows("customer").filter { sampleCustomer == nil || $0["id"]?.string != sampleCustomer }.count,
        visitPlans: rows("service_plan").count,
        leakJobs: rows("job").filter { $0["type"]?.string == "detection" && $0["sample"]?.bool != true }.count,
        reportsSent: rows("report").filter {
            $0["sent_at"]?.string != nil && (sampleId == nil || $0["job_id"]?.string != sampleId)
        }.count,
        invoicesSent: rows("invoice").filter { $0["sent_at"]?.string != nil }.count,
        sample: sample.map { _ in
            SampleProgress(jobId: sampleLive == nil ? nil : sampleId, done: sampleLive == nil || sampleSent)
        })
}
