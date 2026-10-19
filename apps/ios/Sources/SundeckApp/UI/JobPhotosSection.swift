#if os(iOS)
    import SwiftUI

    /// The job page's Photos section (stub until the screen helper builds it).
    struct JobPhotosSection: View {
        var job: JobView

        var body: some View {
            MediaSection(target: MediaTarget(jobId: job.id), title: "Photos and Recordings")
        }
    }
#endif
