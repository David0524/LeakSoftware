#if os(iOS)
    import AVFoundation
    import SundeckCore
    import SwiftUI
    import UIKit

    /// Records a voice note offline, inside the media section. Starts as soon as it appears; Stop
    /// and Save saves, Discard throws it away (asking first after 5 seconds). Stops and saves by
    /// itself at the length limit, and leaving the screen mid-recording keeps the recording. Port
    /// of apps/mobile/src/features/media/VoiceRecorder.tsx, with AVAudioRecorder.
    struct VoiceRecorder: View {
        var onSaved: (CapturedFile) async -> Void
        var onClose: () -> Void

        @State private var recorder = VoiceRecording()
        @State private var saving = false
        @State private var confirmDiscard = false
        @State private var permissionDenied = false
        @Environment(\.openURL) private var openURL

        var body: some View {
            Group {
                HStack(spacing: 10) {
                    Circle()
                        .fill(Color.fail)
                        .frame(width: 14, height: 14)
                        .opacity(recorder.isRecording ? 1 : 0.3)
                        .accessibilityHidden(true)
                    Text(formatDuration(recorder.durationMs))
                        .font(.title3.weight(.semibold).monospacedDigit())
                    Text(VoiceNoteRules.status(recording: recorder.isRecording))
                        .font(.subheadline).foregroundStyle(Color.muted)
                    Spacer()
                }
                .accessibilityElement(children: .combine)
                .frame(minHeight: minTarget)
                Text(VoiceNoteRules.hint).font(.subheadline).foregroundStyle(Color.muted)
                HStack(spacing: 12) {
                    Button("Discard") { discard() }
                        .buttonStyle(.secondary)
                        .disabled(saving)
                    Button {
                        Task { await stop(save: true) }
                    } label: {
                        if saving { ProgressView().tint(Color.onPrimary) } else { Text("Stop and Save") }
                    }
                    .buttonStyle(.primary)
                    .disabled(!recorder.isRecording)
                }
            }
            .task { await start() }
            .onDisappear {
                // Leaving the screen mid-recording keeps the recording rather than losing it.
                if recorder.isRecording { Task { await stop(save: true) } }
            }
            .onChange(of: recorder.durationMs) { _, ms in
                if recorder.isRecording && VoiceNoteRules.reachedLimit(ms) { Task { await stop(save: true) } }
            }
            .confirmationDialog(VoiceNoteRules.discardTitle, isPresented: $confirmDiscard, titleVisibility: .visible) {
                Button("Discard", role: .destructive) { Task { await stop(save: false) } }
                Button("Keep Recording", role: .cancel) {}
            }
            .alert(VoiceNoteRules.permissionTitle, isPresented: $permissionDenied) {
                Button("Cancel", role: .cancel) { onClose() }
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                    onClose()
                }
            } message: {
                Text(VoiceNoteRules.permissionMessage)
            }
        }

        private func start() async {
            guard await AVAudioApplication.requestRecordPermission() else {
                permissionDenied = true
                return
            }
            do {
                try recorder.start()
            } catch {
                onClose()
            }
        }

        private func discard() {
            if VoiceNoteRules.asksBeforeDiscard(recorder.durationMs) {
                confirmDiscard = true
            } else {
                Task { await stop(save: false) }
            }
        }

        private func stop(save: Bool) async {
            guard let file = recorder.stop() else { return }
            if save {
                saving = true
                await onSaved(file)
            } else {
                try? FileManager.default.removeItem(at: file.url)
            }
            onClose()
        }
    }

    /// The recorder and its clock. Expo's high-quality preset: AAC, 44.1 kHz, stereo, 128 kbps.
    @MainActor @Observable
    final class VoiceRecording {
        private(set) var isRecording = false
        private(set) var durationMs: Double = 0
        @ObservationIgnored private var recorder: AVAudioRecorder?
        @ObservationIgnored private var startedAt: String?
        @ObservationIgnored private var clock: Task<Void, Never>?
        @ObservationIgnored private var finished = false

        func start() throws {
            guard recorder == nil, !finished else { return }
            let audio = AVAudioSession.sharedInstance()
            try audio.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try audio.setActive(true)
            let url = CaptureRules.tempURL("m4a")
            let recorder = try AVAudioRecorder(
                url: url,
                settings: [
                    AVFormatIDKey: kAudioFormatMPEG4AAC,
                    AVSampleRateKey: 44_100,
                    AVNumberOfChannelsKey: 2,
                    AVEncoderBitRateKey: 128_000,
                    AVEncoderAudioQualityKey: AVAudioQuality.max.rawValue,
                ])
            guard recorder.prepareToRecord(), recorder.record() else {
                throw MediaError("The voice note couldn’t start.")
            }
            self.recorder = recorder
            startedAt = CaptureRules.now()
            isRecording = true
            clock = Task { [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 250_000_000)
                    guard let self, let recorder = self.recorder, recorder.isRecording else { return }
                    self.durationMs = recorder.currentTime * 1000
                }
            }
        }

        /// Stops once; returns the recording as a capture, or nil if it already stopped.
        func stop() -> CapturedFile? {
            guard !finished, let recorder else { return nil }
            finished = true
            let duration = recorder.currentTime * 1000
            recorder.stop()
            clock?.cancel()
            isRecording = false
            durationMs = duration
            try? AVAudioSession.sharedInstance().setCategory(.playback)
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            return VoiceNoteRules.captured(url: recorder.url, durationMs: duration, startedAt: startedAt)
        }
    }
#endif
