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
    return ShopProgress(
        people: max(active, 1),
        openInvites: invites,
        hasLogo: !logo.isEmpty,
        paymentsReady: payments,
        customers: rows("customer").count,
        visitPlans: rows("service_plan").count,
        leakJobs: rows("job").filter { $0["type"]?.string == "detection" }.count,
        reportsSent: rows("report").filter { $0["sent_at"]?.string != nil }.count,
        invoicesSent: rows("invoice").filter { $0["sent_at"]?.string != nil }.count)
}
