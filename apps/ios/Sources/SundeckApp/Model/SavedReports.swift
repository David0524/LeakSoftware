import Foundation
import SundeckCore
import SundeckSync

// Saved reports (owner, 2026-10-20: "Be able to save report templates. Not like AI prompts, but
// a copy/paste essentially that the tech uses each time"): a shop's own wording by section,
// synced (`saved_report`), read by everyone, written by owners and admins. On a draft, Use Saved
// Report fills the sections it has text for, word for word (core `applySavedReport`).

public struct SavedReport: Identifiable, Equatable, Sendable {
    public var id: String
    public var name: String
    /// Text by section key (`savedReportSections`).
    public var sections: [String: String]
    public var sortOrder: Int

    /// "Summary, What we found" — the sections it fills.
    public var detail: String {
        let titles = savedReportSectionList.filter { sections[$0.key] != nil }.map(\.title)
        return titles.isEmpty ? "No text yet" : titles.joined(separator: ", ")
    }

    public var sectionsJSON: JSONValue { .object(sections.mapValues { .string($0) }) }
}

public enum SavedReportText {
    public static let use = "Use Saved Report"
    public static let saveAs = "Save as Saved Report"
    public static let group = "Saved reports"
    public static let groupFooter =
        "Your own wording for a report, by section. On a draft, Use Saved Report puts it in word for word."
    public static let add = "Add Saved Report"
    public static let none = "No saved reports yet. Owners and admins add them in Settings › Report Templates."
    public static let replace = "Replace"
    public static let delete = "Delete Saved Report"
    public static let deleteConfirm = "Delete this saved report?"
    public static let nameHint = "What it’s for, like “No leak found”."
    public static let saveAsHint = "Saves this draft’s text, by section, for the next report."

    public static func used(_ name: String) -> String { "Used “\(name)”. Read it over before sending." }
    public static func saved(_ name: String) -> String { "Saved as “\(name)”." }
}

public func savedReports(_ store: LocalStore, companyId: String) -> [SavedReport] {
    ((try? store.list("saved_report", companyId: companyId)) ?? [])
        .compactMap { r -> SavedReport? in
            guard let id = r["id"]?.string else { return nil }
            return SavedReport(
                id: id, name: r["name"]?.string ?? "", sections: savedReportSections(r["sections"]),
                sortOrder: Int(r["sort_order"]?.number ?? 0))
        }
        .sorted { ($0.sortOrder, $0.name.lowercased()) < ($1.sortOrder, $1.name.lowercased()) }
}

/// A saved report's name check (the table allows 1 to 80 characters).
public func savedReportNameProblem(_ name: String) -> String? {
    let t = name.trimmingCharacters(in: .whitespacesAndNewlines)
    if t.isEmpty { return "Enter a name." }
    if t.count > 80 { return "Keep the name under 80 characters." }
    return nil
}

@MainActor
public enum SavedReportWrites {
    /// Adds one at the end of the list; returns its id.
    @discardableResult
    public static func add(_ sync: SyncService, companyId: String, name: String, sections: [String: String]) throws
        -> String
    {
        let last = savedReports(sync.store, companyId: companyId).map(\.sortOrder).max() ?? 0
        return try sync.insert(
            "saved_report", companyId: companyId,
            [
                "name": .string(name.trimmingCharacters(in: .whitespacesAndNewlines)),
                "sections": .object(
                    savedReportSections(.object(sections.mapValues { .string($0) })).mapValues {
                        .string($0)
                    }),
                "sort_order": .number(Double(last + 1)),
            ])
    }

    public static func save(
        _ sync: SyncService, companyId: String, id: String, name: String, sections: [String: String]
    ) throws {
        try sync.write(
            "saved_report", id: id, companyId: companyId,
            [
                "name": .string(name.trimmingCharacters(in: .whitespacesAndNewlines)),
                "sections": .object(
                    savedReportSections(.object(sections.mapValues { .string($0) })).mapValues {
                        .string($0)
                    }),
            ])
    }

    public static func delete(_ sync: SyncService, id: String) throws { try sync.softDelete("saved_report", id) }
}

extension ReportFlow {
    /// The draft's sections as the tech sees them now (with unsaved edits).
    public var currentSections: [FinalSection] {
        let sections =
            jobReports(sync.store, jobId: jobId).first { $0.templateKey == template && $0.status == .draft }?
            .finalSections ?? []
        return sections.map { FinalSection(key: $0.key, title: $0.title, text: sectionText($0)) }
    }

    /// The sections of the draft a saved report would replace, which the tab asks about first.
    public func savedReportReplaces(_ saved: SavedReport) -> [String] {
        applySavedReport(currentSections, saved.sectionsJSON).replaces
    }

    /// Use Saved Report: fills the draft's sections with its text and saves it like an edit.
    public func useSavedReport(_ saved: SavedReport) {
        for (key, text) in saved.sections { edits[key] = text }
        saveEdits()
        if saveError == nil { message = SavedReportText.used(saved.name) }
    }

    /// Save as Saved Report (owners and admins): the draft's text, by section.
    public func saveAsSavedReport(name: String) throws {
        if let problem = savedReportNameProblem(name) { throw WebAPI.Failure(description: problem) }
        saveEdits()
        try SavedReportWrites.add(sync, companyId: companyId, name: name, sections: savedReportFrom(currentSections))
        message = SavedReportText.saved(name.trimmingCharacters(in: .whitespacesAndNewlines))
    }
}
