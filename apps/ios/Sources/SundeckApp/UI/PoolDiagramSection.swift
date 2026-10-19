#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// "Pool Diagram" at the top of a leak job's Findings section (owner, 2026-10-19): the pool
    /// drawn from its shape and layout with the findings' pins, then Edit Pool Shape. Port of
    /// DiagramPanel in apps/web/src/components/diagram-work.tsx.
    struct PoolDiagramSection: View {
        var job: JobView
        @Environment(SyncService.self) private var sync
        @State private var editing = false

        var body: some View {
            let _ = sync.revision
            let companyId = job.job["company_id"]?.string ?? ""
            let property = job.property.flatMap { (try? sync.store.get("property", $0.id)) ?? $0 }
            if let property {
                let config = InspectionConfig(sync.store, companyId: companyId)
                let pins = findingPins(JobInspection(sync.store, jobId: job.id), config)
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeading("Pool Diagram")
                    PoolDiagram(
                        shape: diagramShape(of: property), hasSpa: property["has_spa"]?.bool ?? false,
                        layout: diagramLayout(of: property), pins: pins
                    )
                    .frame(maxWidth: 672)
                    // Mark Up joins Edit Pool Shape here.
                    FlowRow(spacing: 12) {
                        Button("Edit Pool Shape") { editing = true }.buttonStyle(.secondary)
                    }
                }
                .sheet(isPresented: $editing) {
                    PoolShapeSheet(
                        propertyId: property.id, companyId: companyId, form: PoolShapeForm(property: property))
                }
            }
        }
    }

    /// Edit Pool Shape: the shape tiles, Mirror, Has a spa, then for a spa where it sits (tap the
    /// drawing), Put the Spa Back in the Corner, its size and shape; Save Pool Shape.
    struct PoolShapeSheet: View {
        var propertyId: String
        var companyId: String
        @State var form: PoolShapeForm
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var original: PoolShapeForm?
        @State private var error: String?

        var body: some View {
            FormSheet(title: PoolShapeForm.title, dirty: original != nil && original != form) {
                ShapePicker(value: form.shape) { form.shape = $0 }
                Grouped {
                    SwitchRow(PoolShapeForm.mirrorLabel, isOn: $form.mirror)
                    SwitchRow(PoolShapeForm.spaLabel, isOn: $form.hasSpa)
                }
                if form.hasSpa {
                    VStack(alignment: .leading, spacing: 4) {
                        FieldLabel(PoolShapeForm.placeLabel)
                        FieldHint(text: PoolShapeForm.placeHint)
                        PoolDiagram(
                            shape: form.shape, hasSpa: true, layout: form.layout, pins: [], outlined: true,
                            spaPlacement: SpaPlacement(value: form.placeValue) { dx, dy in
                                form.nudge(dx: dx, dy: dy)
                            }
                        ) { x, y in
                            withAnimation(Motion.smooth) { form.place(x: x, y: y) }
                        }
                        .padding(.top, 4)
                        if form.spaAt != nil {
                            Button(PoolShapeForm.resetSpa) { withAnimation(Motion.smooth) { form.resetSpa() } }
                                .buttonStyle(.quiet)
                                .padding(.leading, -20)
                        }
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        FieldLabel(PoolShapeForm.sizeLabel)
                        Segmented(
                            selection: $form.size, options: SpaSize.allCases, label: \.label,
                            title: PoolShapeForm.sizeLabel, fillsWidth: true)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        FieldLabel(PoolShapeForm.shapeLabel)
                        Segmented(
                            selection: $form.spaShape, options: SpaShape.allCases, label: \.label,
                            title: PoolShapeForm.shapeLabel, fillsWidth: true)
                    }
                } else {
                    PoolDiagram(shape: form.shape, hasSpa: false, layout: form.layout, pins: [])
                }
                if let error { Notice(kind: .error, text: error) }
                Button(PoolShapeForm.save) { save() }.buttonStyle(.primary(fullWidth: true, size: .field))
            }
            .onAppear { if original == nil { original = form } }
        }

        private func save() {
            do {
                try InspectionWrites.savePoolShape(sync, propertyId: propertyId, companyId: companyId, form)
                dismiss()
            } catch {
                self.error = String(describing: error)
            }
        }
    }
#endif
