#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// "Take a photo of the pool before finishing this job." with Take Photo (the usual capture
    /// flow, saved to the job), shown where Mark Done or a report's finish or send was stopped by
    /// the shop's photo rule. Once a photo is saved the notice says so, and the tech tries again.
    struct FinishPhotoNotice: View {
        var jobId: String
        @Environment(SyncService.self) private var sync
        @State private var capture: CaptureController

        init(jobId: String) {
            self.jobId = jobId
            _capture = State(initialValue: CaptureController(target: MediaTarget(jobId: jobId)))
        }

        var body: some View {
            let _ = sync.revision
            let hasPhoto = jobPhotoCount(sync.store, jobId: jobId) > 0
            VStack(alignment: .leading, spacing: 12) {
                if hasPhoto {
                    Notice(kind: .success, text: FinishPhotoText.taken)
                } else {
                    Notice(kind: .error, text: finishPhotoMessage)
                    Button {
                        Task { await capture.openCamera(.photo) }
                    } label: {
                        Label(FinishPhotoText.takePhoto, systemImage: "camera")
                    }
                    .buttonStyle(.secondary)
                    .disabled(capture.busy != nil)
                }
            }
            .captureFlow(capture)
        }
    }
#endif
