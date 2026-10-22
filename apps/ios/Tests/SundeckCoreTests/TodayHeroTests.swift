import Foundation
import SundeckCore
import Testing

/// today-hero: Today's card for the stop a tech is on, and the Live Activity's stop.
@Suite struct TodayHeroTests {
    let module = "today-hero"

    @Test func everyRuleIsChecked() {
        let checked: Set<String> = [
            "todayHero", "todayHeroViewing", "onTheWay", "heroActions", "HERO_ACTION_LABELS", "heroSubtitle",
            "heroDrive",
            "heroSegmentsSpoken", "heroHeadline", "heroTopLine",
        ]
        #expect(Fixtures.rules(module) == checked)
    }

    @Test func card() {
        checkRule(module, "todayHero") { c in
            try todayHero(
                stops: c.arg(0), today: c.arg(1), timeZone: c.arg(2), justDone: c.arg(3, as: String?.self))
        }
        checkRule(module, "todayHeroViewing") { c in
            try todayHero(
                stops: c.arg(0), today: c.arg(1), timeZone: c.arg(2), viewing: c.arg(3, as: String?.self))
        }
        checkRule(module, "onTheWay") { c in
            try onTheWay(c.arg(0), today: c.arg(1), timeZone: c.arg(2))
        }
    }

    @Test func buttonsAndLines() {
        checkRule(module, "heroHeadline") { c in
            guard let moment = HeroMoment(rawValue: try c.arg(0)) else { throw NotRepresentable() }
            return heroHeadline(moment, headline: try c.arg(1))
        }
        checkRule(module, "heroActions") { c in
            guard let moment = HeroMoment(rawValue: try c.arg(0)) else { throw NotRepresentable() }
            return heroActions(
                moment, mine: try c.arg(1), checklistDone: try c.arg(2), hasChecklist: try c.arg(3))
        }
        checkRule(module, "HERO_ACTION_LABELS") { _ in labelTable { (a: HeroAction) in a.label } }
        checkRule(module, "heroSubtitle") { c in
            guard let moment = HeroMoment(rawValue: try c.arg(3)) else { throw NotRepresentable() }
            return heroSubtitle(try c.arg(0), stop: try c.arg(1), stops: try c.arg(2), moment: moment)
        }
        checkRule(module, "heroDrive") { c in
            guard let moment = HeroMoment(rawValue: try c.arg(0)) else { throw NotRepresentable() }
            return heroDrive(moment, try c.arg(1, as: Int?.self))
        }
        checkRule(module, "heroTopLine") { c in
            guard
                let hero = try todayHero(
                    stops: c.arg(0), today: c.arg(1), timeZone: c.arg(2), viewing: c.arg(3, as: String?.self))
            else { throw NotRepresentable() }
            return heroTopLine(hero)
        }
        checkRule(module, "heroSegmentsSpoken") { c in
            heroSegmentsSpoken(doneCount: try c.arg(0), stops: try c.arg(1))
        }
    }
}
