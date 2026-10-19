import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { Alert, Linking, StyleSheet, View } from "react-native";
import { MEDIA_LIMITS, formatDuration } from "@leakbook/core";
import { VOICE_MIME } from "../../lib/media";
import { Button, Row, T } from "../../ui/components";
import { color, space } from "../../ui/theme";
import { confirmDestructive } from "../../ui/confirm";
import type { CapturedFile } from "../../lib/media";

/**
 * Records a voice note offline. Starts as soon as it appears; Stop saves, Cancel discards.
 * Stops on its own at the length limit.
 */
export function VoiceRecorder({
  onSaved,
  onClose,
}: {
  onSaved: (file: CapturedFile) => Promise<void>;
  onClose: () => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [saving, setSaving] = useState(false);
  const startedAt = useRef<string | null>(null);
  const finished = useRef(false);
  // Leaving the screen mid-recording keeps the recording rather than losing it.
  const saveOnLeave = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Microphone access is off", "Turn it on in Settings to record voice notes.", [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => void Linking.openSettings() },
        ]);
        onClose();
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (cancelled) return;
      startedAt.current = new Date().toISOString();
      recorder.record();
    })();
    return () => {
      cancelled = true;
      if (!finished.current && recorder.isRecording) saveOnLeave.current();
      void setAudioModeAsync({ allowsRecording: false });
    };
    // Runs once per recorder; onClose is stable for the life of this sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder]);

  async function stop(save: boolean) {
    if (finished.current) return;
    finished.current = true;
    setSaving(save);
    const duration = state.durationMillis;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    try {
      if (save && recorder.uri) {
        await onSaved({
          kind: "audio",
          uri: recorder.uri,
          mime: VOICE_MIME,
          width: null,
          height: null,
          durationMs: Math.round(duration),
          capturedAt: startedAt.current ?? new Date().toISOString(),
        });
      }
    } finally {
      onClose();
    }
  }

  useEffect(() => {
    saveOnLeave.current = () => {
      finished.current = true;
      const duration = state.durationMillis;
      void recorder.stop().then(() => {
        if (!recorder.uri) return;
        void onSaved({
          kind: "audio",
          uri: recorder.uri,
          mime: VOICE_MIME,
          width: null,
          height: null,
          durationMs: Math.round(duration),
          capturedAt: startedAt.current ?? new Date().toISOString(),
        });
      });
    };
  });

  function discard() {
    if (state.durationMillis < 5_000) return void stop(false);
    confirmDestructive({
      title: "Discard this voice note?",
      confirm: "Discard",
      cancel: "Keep Recording",
      onConfirm: () => void stop(false),
    });
  }

  const limitMs = MEDIA_LIMITS.voiceMaxSeconds * 1000;
  useEffect(() => {
    if (state.isRecording && state.durationMillis >= limitMs) void stop(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.durationMillis, state.isRecording]);

  // In the capture card, in place of the tiles (as on the website): the time, then Stop and
  // Save, then Discard.
  return (
    <View style={styles.wrap}>
      <Row style={{ gap: space["2"] }}>
        <View
          style={[
            styles.dot,
            { backgroundColor: color.fail, opacity: state.isRecording ? 1 : 0.3 },
          ]}
        />
        <T variant="bodyEmphasis" style={styles.time}>
          {state.isRecording ? `Recording ${formatDuration(state.durationMillis)}` : "Starting…"}
        </T>
      </Row>
      <Row style={{ gap: space["3"], flexWrap: "wrap" }}>
        <Button
          title="Stop and Save"
          kind="secondary"
          onPress={() => void stop(true)}
          loading={saving}
          disabled={!state.isRecording}
        />
        <Button title="Discard" kind="quiet" onPress={discard} disabled={saving} />
      </Row>
      <T variant="secondary" muted>
        Up to {MEDIA_LIMITS.voiceMaxSeconds / 60} minutes. Works offline.
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space["2"] },
  dot: { width: 12, height: 12, borderRadius: 6 },
  time: { fontVariant: ["tabular-nums"] },
});
