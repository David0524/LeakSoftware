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
import { Button, Card, Row, T } from "../../ui/components";
import { color, space } from "../../ui/theme";
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
    Alert.alert("Discard this voice note?", undefined, [
      { text: "Keep Recording", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => void stop(false) },
    ]);
  }

  const limitMs = MEDIA_LIMITS.voiceMaxSeconds * 1000;
  useEffect(() => {
    if (state.isRecording && state.durationMillis >= limitMs) void stop(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.durationMillis, state.isRecording]);

  return (
    <Card style={styles.card}>
      <Row>
        <View style={[styles.dot, { opacity: state.isRecording ? 1 : 0.3 }]} />
        <T variant="heading" style={styles.time}>
          {formatDuration(state.durationMillis)}
        </T>
        <T variant="muted">{state.isRecording ? "Recording" : "Starting…"}</T>
      </Row>
      <T variant="muted">Up to {MEDIA_LIMITS.voiceMaxSeconds / 60} minutes. Works offline.</T>
      <Row style={{ gap: space["3"] }}>
        <Button
          title="Discard"
          kind="secondary"
          onPress={discard}
          disabled={saving}
          style={{ flex: 1 }}
        />
        <Button
          title="Stop and Save"
          onPress={() => void stop(true)}
          loading={saving}
          disabled={!state.isRecording}
          style={{ flex: 1 }}
        />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: color.fail, borderWidth: 2 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: color.fail },
  time: { fontVariant: ["tabular-nums"] },
});
