#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// "Pool Diagram" at the top of a leak job's Findings section (owner, 2026-10-19): the pool
    /// drawn from its shape and layout with the findings' pins and the job's markup, then Edit
    /// Pool Shape and Mark Up. Port of
    /// DiagramPanel in apps/web/src/components/diagram-work.tsx.
    struct PoolDiagramSection: View {
        var job: JobView
        @Environment(SyncService.self) private var sync
        @State private var editing = false
        @State private var markingUp = false

        var body: some View {
            let _ = sync.revision
            let companyId = job.job["company_id"]?.string ?? ""
            let property = job.property.flatMap { (try? sync.store.get("property", $0.id)) ?? $0 }
            // The job as it is now (Mark Up writes its diagram markup).
            let jobRow = (try? sync.store.get("job", job.id)) ?? job.job
            if let property {
                let config = InspectionConfig(sync.store, companyId: companyId)
                let pins = findingPins(JobInspection(sync.store, jobId: job.id), config)
                let shapes = jobDiagramMarkup(jobRow)
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeading("Pool Diagram")
                    PoolDiagram(
                        shape: diagramShape(of: property), hasSpa: property["has_spa"]?.bool ?? false,
                        layout: diagramLayout(of: property), pins: pins, markup: shapes
                    )
                    .frame(maxWidth: 672)
                    FlowRow(spacing: 12) {
                        Button("Edit Pool Shape") { editing = true }.buttonStyle(.secondary)
                        Button(diagramMarkupButton(shapes)) { markingUp = true }.buttonStyle(.secondary)
                    }
                }
                .fullScreenCover(isPresented: $markingUp) {
                    DiagramMarkupEditor(
                        jobId: job.id, companyId: companyId, property: property, pins: pins, saved: shapes)
                }
                .sheet(isPresented: $editing) {
                    PoolShapeSheet(
                        propertyId: property.id, companyId: companyId, form: PoolShapeForm(property: property))
                }
            }
        }
    }

    /// Mark Up Diagram: the markup tools over the pool with its spa and the findings' numbered
    /// pins (drawn, not tappable), as the website's editor; saves `job.diagram_markup`.
    struct DiagramMarkupEditor: View {
        var jobId: String
        var companyId: String
        var property: Row
        var pins: [DiagramPin]
        var saved: [MarkupShape]
        @Environment(SyncService.self) private var sync

        var body: some View {
            MarkupCanvasEditor(
                title: "Mark Up Diagram", canvasLabel: "Pool diagram", ratio: 100.0 / 160,
                space: diagramMarkupSpace, saved: saved, width: 800, height: 500
            ) {
                PoolDiagram(
                    shape: diagramShape(of: property), hasSpa: property["has_spa"]?.bool ?? false,
                    layout: diagramLayout(of: property), pins: pins
                )
                .allowsHitTesting(false)
            } save: { markup, _ in
                try InspectionWrites.setDiagramMarkup(sync, jobId: jobId, companyId: companyId, markup)
            }
        }
    }

#endif
