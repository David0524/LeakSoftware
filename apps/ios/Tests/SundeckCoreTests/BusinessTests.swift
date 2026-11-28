import Foundation
import SundeckCore
import Testing

/// business.ts (2026-11-26): the second business name and the tech's photo.
@Suite struct BusinessTests {
    let module = "business"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "hasSecondBusiness", "workBusiness", "jobBusiness", "businessIdentity", "jobBusinessName",
                "businessChoices", "BUSINESS_WORK_LABELS", "SECOND_BUSINESS_TEXT", "showsTechOnReports",
                "TECH_CARD_TEXT", "techInitial", "memberPhotoPath",
            ])
    }

    @Test func secondBusiness() {
        checkRule(module, "hasSecondBusiness") { c in hasSecondBusiness(try c.arg(0, as: BusinessCompany.self)) }
        checkRule(module, "workBusiness") { c in
            workBusiness(try c.arg(0, as: BusinessCompany.self), try c.arg(1, as: BusinessWork.self))
        }
        checkRule(module, "jobBusiness") { c in
            jobBusiness(
                try c.arg(0, as: BusinessCompany.self), try c.arg(1, as: BusinessJob.self),
                try c.arg(2, as: BusinessJob?.self))
        }
        checkRule(module, "businessIdentity") { c in
            businessIdentity(try c.arg(0, as: BusinessCompany.self), try c.arg(1, as: Business.self))
        }
        checkRule(module, "jobBusinessName") { c in
            jobBusinessName(
                try c.arg(0, as: BusinessCompany.self), try c.arg(1, as: BusinessJob?.self),
                try c.arg(2, as: BusinessJob?.self))
        }
        checkRule(module, "businessChoices") { c in businessChoices(try c.arg(0, as: BusinessCompany.self)) }
    }

    @Test func words() {
        checkRule(module, "BUSINESS_WORK_LABELS") { _ in labelTable(\BusinessWork.label) }
        checkRule(module, "SECOND_BUSINESS_TEXT") { _ in
            [
                "header": SecondBusinessText.header, "name": SecondBusinessText.name,
                "logo": SecondBusinessText.logo, "phone": SecondBusinessText.phone,
                "email": SecondBusinessText.email, "reviewUrl": SecondBusinessText.reviewUrl,
                "color": SecondBusinessText.color, "useFor": SecondBusinessText.useFor,
                "footer": SecondBusinessText.footer, "jobRow": SecondBusinessText.jobRow,
            ]
        }
        checkRule(module, "TECH_CARD_TEXT") { _ in
            [
                "label": .string(TechCardText.label), "footer": .string(TechCardText.footer),
                "photo": .string(TechCardText.photo), "myPhoto": .string(TechCardText.myPhoto),
                "myPhotoFooter": .string(TechCardText.myPhotoFooter), "addPhoto": .string(TechCardText.addPhoto),
                "changePhoto": .string(TechCardText.changePhoto), "removePhoto": .string(TechCardText.removePhoto),
                "size": JSONValue.number(Double(TechCardText.size)),
            ] as [String: JSONValue]
        }
    }

    @Test func techOnReports() {
        checkRule(module, "showsTechOnReports") { c in showsTechOnReports(try c.arg(0, as: JSONValue?.self)) }
        checkRule(module, "techInitial") { c in techInitial(try c.arg(0, as: String?.self)) }
        checkRule(module, "memberPhotoPath") { c in
            memberPhotoPath(try c.arg(0), try c.arg(1), try c.arg(2, as: Int.self))
        }
    }
}
