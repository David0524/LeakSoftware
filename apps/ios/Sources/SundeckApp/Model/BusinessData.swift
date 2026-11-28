import Foundation
import SundeckCore
import SundeckSync

// The second business on the phone (2026-11-26; SundeckCore Business.swift): which name a job's
// customer sees, read from the synced company and job rows.

/// The shop's company row as the business rules read it (`fallbackName` when it isn't synced yet).
public func businessCompany(_ store: LocalStore, companyId: String, fallbackName: String = "") -> BusinessCompany {
    BusinessCompany(row: try? store.get("company", companyId), fallbackName: fallbackName)
}

/// The job a repair came from (`parent_job_id`), when it is on the phone.
public func parentBusinessJob(_ store: LocalStore, job: Row?) -> BusinessJob? {
    guard let id = job?["parent_job_id"]?.string else { return nil }
    return BusinessJob(row: try? store.get("job", id))
}

/// The business name a job's customer sees (share texts, On My Way, signature statements): the
/// shop's name without a second business or without a job.
public func customerBusinessName(_ store: LocalStore, companyId: String, fallbackName: String, job: Row?) -> String {
    let company = businessCompany(store, companyId: companyId, fallbackName: fallbackName)
    return jobBusinessName(company, BusinessJob(row: job), parentBusinessJob(store, job: job))
}

/// The same, by the job's id.
public func customerBusinessName(_ store: LocalStore, companyId: String, fallbackName: String, jobId: String?)
    -> String
{
    let job = jobId.flatMap { try? store.get("job", $0) }
    return customerBusinessName(store, companyId: companyId, fallbackName: fallbackName, job: job)
}
