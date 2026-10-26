#if os(iOS)
    import PDFKit
    import SundeckCore
    import SwiftUI
    import UIKit
    import WebKit

    // While the app waits on a report (owner, 2026-10-20: "It is a long white screen when loading.
    // We need to keep users engaged during that loading time"): a short step list that checks off,
    // the PDF downloaded in the app with a progress bar and shown with PDFKit, and the report page
    // in a web view that shows its steps and progress until it has drawn.

    /// The steps of a wait: done ones checked, the current one with a spinner, the rest waiting.
    struct ProgressSteps: View {
        var steps: [String]
        var current: Int

        var body: some View {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                    HStack(spacing: 10) {
                        Group {
                            if index < current {
                                Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.pass)
                                    .transition(.scale.combined(with: .opacity))
                            } else if index == current {
                                ProgressView().controlSize(.small)
                            } else {
                                Image(systemName: "circle").foregroundStyle(Color.textMuted.opacity(0.6))
                            }
                        }
                        .font(.system(size: 18))
                        .frame(width: 22, height: 22)
                        Text(step)
                            .textRole(index == current ? .bodyEmphasis : .body)
                            .foregroundStyle(index > current ? Color.textMuted : Color.text)
                    }
                }
            }
            .animation(Motion.snappy, value: current)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(ReportProgress.spoken(steps, current))
            .accessibilityAddTraits(.updatesFrequently)
        }
    }

    // MARK: - The PDF

    /// Downloads a report's PDF with a progress bar, then shows it with PDFKit and a share button.
    struct PDFSheet: View {
        var url: URL
        @Environment(\.dismiss) private var dismiss
        @State private var step = 0
        @State private var fraction: Double?
        @State private var file: URL?
        @State private var error: String?

        var body: some View {
            NavigationStack {
                Group {
                    if let file {
                        PDFKitView(url: file).ignoresSafeArea(edges: .bottom)
                    } else if let error {
                        ScreenScroll {
                            Notice(kind: .error, text: error)
                            Button("Try Again") { Task { await load() } }.buttonStyle(.secondary)
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 20) {
                            ProgressSteps(steps: ReportProgress.pdf, current: step)
                            if step == 1 {
                                if let fraction {
                                    ProgressView(value: fraction).tint(Color.link)
                                } else {
                                    ProgressView().progressViewStyle(.linear).tint(Color.link)
                                }
                            }
                            Spacer()
                        }
                        .padding(CGFloat(Spacing.pageMargin))
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                        .background(Color.bg)
                    }
                }
                .navigationTitle("Report PDF")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
                    if let file {
                        ToolbarItem(placement: .primaryAction) {
                            ShareLink(item: file) { Image(systemName: "square.and.arrow.up") }
                                .accessibilityLabel("Share")
                        }
                    }
                }
            }
            .task { await load() }
        }

        private func load() async {
            error = nil
            step = 0
            fraction = nil
            // A download task, not a byte-by-byte read: reading a photo-heavy PDF one byte at a
            // time (several MB) took long enough to look stuck (owner, 2026-10-26: Abby Navarro's
            // PDF). Step 1 starts when the server's answer arrives (it makes the PDF first); the
            // bar follows the task's progress.
            let watcher = DownloadWatcher()
            let progress = Task { @MainActor in
                while !Task.isCancelled {
                    if let task = watcher.task {
                        if task.response != nil, step == 0 { step = 1 }
                        let p = task.progress
                        if p.totalUnitCount > 0 { fraction = min(1, p.fractionCompleted) }
                    }
                    try? await Task.sleep(for: .milliseconds(150))
                }
            }
            defer { progress.cancel() }
            do {
                let (download, response) = try await URLSession.shared.download(from: url, delegate: watcher)
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard (200..<300).contains(status) else {
                    error = "The PDF couldn’t be made. Try again."
                    return
                }
                step = 1
                fraction = 1
                let target = FileManager.default.temporaryDirectory.appendingPathComponent("Report.pdf")
                try? FileManager.default.removeItem(at: target)
                try FileManager.default.moveItem(at: download, to: target)
                withAnimation(Motion.smooth) { file = target }
            } catch {
                self.error = WebAPI.Failure.noConnection
            }
        }
    }

    /// Hands the PDF sheet the download task, so it can show when the answer starts and how much
    /// has arrived.
    private final class DownloadWatcher: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
        private let lock = NSLock()
        private var created: URLSessionTask?
        var task: URLSessionTask? { lock.withLock { created } }

        func urlSession(_ session: URLSession, didCreateTask task: URLSessionTask) {
            lock.withLock { created = task }
        }
    }

    private struct PDFKitView: UIViewRepresentable {
        var url: URL

        func makeUIView(context: Context) -> PDFView {
            let view = PDFView()
            view.autoScales = true
            view.displayMode = .singlePageContinuous
            view.document = PDFDocument(url: url)
            return view
        }

        func updateUIView(_ view: PDFView, context: Context) {}
    }

    // MARK: - The report page

    /// The customer's report page in the app, with its steps and a progress bar until it has drawn.
    struct ReportPageSheet: View {
        var url: URL
        @Environment(\.dismiss) private var dismiss
        @State private var progress = 0.0
        @State private var loaded = false

        var body: some View {
            NavigationStack {
                ZStack(alignment: .top) {
                    ReportWebView(url: url, progress: $progress, loaded: $loaded)
                        .opacity(loaded ? 1 : 0)
                    if !loaded {
                        VStack(alignment: .leading, spacing: 20) {
                            ProgressSteps(steps: ReportProgress.page, current: progress < 0.5 ? 0 : 1)
                            ProgressView(value: max(0.05, progress)).tint(Color.link)
                            Spacer()
                        }
                        .padding(CGFloat(Spacing.pageMargin))
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                        .background(Color.bg)
                        .transition(.opacity)
                    }
                }
                .animation(Motion.smooth, value: loaded)
                .navigationTitle("Report")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
                    ToolbarItem(placement: .primaryAction) {
                        ShareLink(item: url) { Image(systemName: "square.and.arrow.up") }
                            .accessibilityLabel("Share")
                    }
                }
            }
        }
    }

    private struct ReportWebView: UIViewRepresentable {
        var url: URL
        @Binding var progress: Double
        @Binding var loaded: Bool

        func makeCoordinator() -> Coordinator { Coordinator(self) }

        func makeUIView(context: Context) -> WKWebView {
            let view = WKWebView()
            view.navigationDelegate = context.coordinator
            context.coordinator.watch(view)
            view.load(URLRequest(url: url))
            return view
        }

        func updateUIView(_ view: WKWebView, context: Context) {}

        @MainActor final class Coordinator: NSObject, WKNavigationDelegate {
            var parent: ReportWebView
            private var observation: NSKeyValueObservation?

            init(_ parent: ReportWebView) { self.parent = parent }

            func watch(_ view: WKWebView) {
                observation = view.observe(\.estimatedProgress, options: [.new]) { [weak self] _, change in
                    let value = change.newValue ?? 0
                    Task { @MainActor in self?.parent.progress = value }
                }
            }

            func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
                parent.progress = 1
                parent.loaded = true
            }

            func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
                parent.loaded = true
            }

            func webView(
                _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error
            ) {
                parent.loaded = true
            }
        }
    }
#endif
