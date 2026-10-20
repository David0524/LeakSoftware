import Foundation
import SundeckCore
import Testing

/// money, uuid, job-status, texting (phone numbers) and models.
@Suite struct BasicsTests {
    let module = "basics"

    @Test func everyRuleIsChecked() {
        let checked: Set<String> = [
            "formatCents", "parseDollars", "uuidv7TimePrefix", "userTransitions", "JOB_STATUS_LABELS", "toE164",
            "formatPhone", "companyServices", "offersPool", "newJobTypes", "seesAllJobs", "canMakeJobs", "roleLabel",
            "isManagerRole", "splitEmails", "POOL_TYPE_LABELS", "jobOnPhones", "requiresFinishPhoto",
            "FINISH_PHOTO_MESSAGE", "REPAIR_ITEM_KEY", "REPAIR_ITEM_LABEL", "jobActionLabel", "jobFeeLabel",
            "parseGallons", "requiresFinishedChecklist", "FINISH_CHECKLIST_MESSAGE", "completeJobBlocker",
            "jobHasWrapUp", "stopDone", "markCompleteValues", "isHexColor", "parseReminderDays",
            "SAVED_REPORT_SECTIONS", "savedReportSections", "applySavedReport", "replaceSavedReportQuestion",
            "savedReportFrom",
        ]
        #expect(Fixtures.rules(module) == checked)
    }

    @Test func money() {
        checkRule(module, "formatCents") { c in
            let value = try c.arg(0, as: Double.self)
            guard value.rounded() == value else { throw NotRepresentable() }
            return formatCents(Int(value))
        }
        checkRule(module, "parseDollars") { c in parseDollars(try c.arg(0)) }
    }

    @Test func companySettings() {
        checkRule(module, "isHexColor") { c in isHexColor(try c.arg(0, as: JSONValue.self)) }
        checkRule(module, "parseReminderDays") { c in parseReminderDays(try c.arg(0)) }
    }

    @Test func savedReports() {
        checkRule(module, "SAVED_REPORT_SECTIONS") { _ in
            savedReportSectionList.map { ["key": $0.key, "title": $0.title] }
        }
        checkRule(module, "savedReportSections") { c in savedReportSections(try c.arg(0, as: JSONValue?.self)) }
        checkRule(module, "applySavedReport") { c in
            let r = applySavedReport(try c.arg(0), try c.arg(1, as: JSONValue?.self))
            return ["sections": try JSONValue(encoding: r.sections), "replaces": try JSONValue(encoding: r.replaces)]
                as JSONValue
        }
        checkRule(module, "replaceSavedReportQuestion") { c in replaceSavedReportQuestion(try c.arg(0)) }
        checkRule(module, "savedReportFrom") { c in savedReportFrom(try c.arg(0)) }
    }

    @Test func uuid() throws {
        checkRule(module, "uuidv7TimePrefix") { c in
            String(uuidv7(milliseconds: try c.arg(0, as: UInt64.self)).prefix(13))
        }
        let id = uuidv7()
        #expect(id.wholeMatch(of: /[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/) != nil)
        #expect(uuidv7() != id)
    }

    @Test func jobStatus() {
        checkRule(module, "userTransitions") { c in
            userTransitions(from: try c.arg(0), type: try c.arg(1, as: String?.self))
        }
        checkRule(module, "JOB_STATUS_LABELS") { _ in labelTable(\JobStatus.label) }
        checkRule(module, "jobActionLabel") { c in jobActionLabel(from: try c.arg(0), to: try c.arg(1)) }
        checkRule(module, "jobFeeLabel") { c in jobFeeLabel(try c.arg(0, as: String?.self)) }
    }

    @Test func phones() {
        checkRule(module, "toE164") { c in toE164(try c.arg(0, as: String?.self)) }
        checkRule(module, "formatPhone") { c in formatPhone(try c.arg(0)) }
    }

    @Test func servicesAndRoles() {
        checkRule(module, "companyServices") { c in companyServices(try c.arg(0)) }
        checkRule(module, "offersPool") { c in offersPool(try c.arg(0)) }
        checkRule(module, "requiresFinishPhoto") { c in requiresFinishPhoto(try c.arg(0, as: JSONValue?.self)) }
        checkRule(module, "FINISH_PHOTO_MESSAGE") { _ in finishPhotoMessage }
        checkRule(module, "requiresFinishedChecklist") { c in
            requiresFinishedChecklist(try c.arg(0, as: JSONValue?.self))
        }
        checkRule(module, "FINISH_CHECKLIST_MESSAGE") { _ in finishChecklistMessage }
        checkRule(module, "completeJobBlocker") { c in
            let job = try c.arg(1, as: [String: Int].self)
            return completeJobBlocker(
                try c.arg(0, as: JSONValue?.self), checklistToDo: job["checklistToDo"] ?? 0, photos: job["photos"] ?? 0)
        }
        checkRule(module, "stopDone") { c in
            let job = try c.arg(0, as: JSONValue.self)
            return stopDone(
                status: job["status"]?.string ?? "", stopDoneOn: job["stop_done_on"]?.string, day: try c.arg(1))
        }
        checkRule(module, "markCompleteValues") { c in
            markCompleteValues(type: try c.arg(0, as: JSONValue.self)["type"]?.string ?? "", day: try c.arg(1))
        }
        checkRule(module, "jobHasWrapUp") { c in jobHasWrapUp(try c.arg(0, as: String?.self)) }
        checkRule(module, "REPAIR_ITEM_KEY") { _ in repairItemKey }
        checkRule(module, "REPAIR_ITEM_LABEL") { _ in repairItemLabel }
        checkRule(module, "newJobTypes") { c in newJobTypes(try c.arg(0)) }
        checkRule(module, "parseGallons") { c in parseGallons(try c.arg(0)) }
        checkRule(module, "seesAllJobs") { c in seesAllJobs(try c.arg(0, as: String?.self), try c.arg(1)) }
        checkRule(module, "canMakeJobs") { c in canMakeJobs(try c.arg(0, as: String?.self), try c.arg(1)) }
        checkRule(module, "roleLabel") { c in roleLabel(try c.arg(0, as: String?.self)) }
        checkRule(module, "isManagerRole") { c in isManagerRole(try c.arg(0, as: String?.self)) }
        checkRule(module, "splitEmails") { c in splitEmails(try c.arg(0)) }
        checkRule(module, "POOL_TYPE_LABELS") { _ in labelTable(\PoolType.label) }
    }

    @Test func phoneHistory() {
        checkRule(module, "jobOnPhones") { c in
            let now = try c.arg(1, as: String.self)
            let date = ISO8601DateFormatter().date(from: now)!
            return jobOnPhones(try c.arg(0), now: date, extraDays: try c.arg(2, as: Int?.self) ?? 0)
        }
    }
}
