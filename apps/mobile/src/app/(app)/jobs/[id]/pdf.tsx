import { Stack, useLocalSearchParams } from "expo-router";
import { DownloadTask, File, Paths } from "expo-file-system";
import { getContentUriAsync } from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { API_URL } from "../../../../lib/config";
import { Button, Card, HeaderButton, Notice, Screen, T } from "../../../../ui/components";
import { ProgressBar, StepList } from "../../../../ui/Progress";
import { space } from "../../../../ui/theme";

import { friendlyError } from "@leakbook/core";
// A sent report's PDF, opened in the app (owner, 2026-10-20: the browser sat on a white page
// while the server made it). The wait shows its steps and a download bar; the file is kept on
// the phone, so opening a version again is instant (sent reports never change). Then it opens
// in the phone's PDF viewer, with Share beside it.

const STEPS = ["Making the PDF", "Downloading it", "Opening it"];

type Phase =
  | { at: "making" }
  | { at: "downloading"; progress: number | null; bytes: number }
  | { at: "ready"; uri: string }
  | { at: "error"; message: string };

function cachedPdf(token: string) {
  return new File(Paths.cache, `report-${token.replace(/[^A-Za-z0-9_-]/g, "")}.pdf`);
}

function megabytes(n: number) {
  return n < 1024 * 1024
    ? `${Math.max(1, Math.round(n / 1024))} KB`
    : `${(n / 1048576).toFixed(1)} MB`;
}

/** Shows a PDF with the phone's own viewer (Android), Quick Look (iPhone) or the browser. */
async function openPdf(uri: string, title: string) {
  if (Platform.OS === "android") {
    try {
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: await getContentUriAsync(uri),
        type: "application/pdf",
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      });
      return;
    } catch {
      // No PDF viewer on this phone: the share sheet offers apps that open it.
    }
  }
  if (Platform.OS === "web") {
    window.open(uri, "_blank", "noopener");
    return;
  }
  await sharePdf(uri, title);
}

async function sharePdf(uri: string, title: string) {
  if (Platform.OS === "web") return void window.open(uri, "_blank", "noopener");
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: title,
  });
}

export default function ReportPdfScreen() {
  const { token, version } = useLocalSearchParams<{ token: string; version?: string }>();
  const title = version ? `Report, Version ${version}` : "Report";
  const [phase, setPhase] = useState<Phase>({ at: "making" });
  const [round, setRound] = useState(0);
  const opened = useRef(false);

  useEffect(() => {
    if (!token || !API_URL) return;
    const url = `${API_URL}/r/${token}/pdf`;
    const abort = new AbortController();
    const ready = (uri: string) => {
      setPhase({ at: "ready", uri });
      if (!opened.current) {
        opened.current = true;
        void openPdf(uri, title);
      }
    };
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (Platform.OS === "web") {
            // The browser preview: fetch it, then hand the browser a local copy.
            const res = await fetch(url, { signal: abort.signal });
            if (!res.ok) throw new Error(friendlyError(`The server said ${res.status}.`));
            setPhase({ at: "downloading", progress: null, bytes: 0 });
            const blob = await res.blob();
            return ready(URL.createObjectURL(blob));
          }
          const file = cachedPdf(token);
          if (file.exists && (file.size ?? 0) > 0) return ready(file.uri);
          const part = new File(Paths.cache, `${file.name}.part`);
          if (part.exists) part.delete();
          const task = new DownloadTask(url, part, {
            signal: abort.signal,
            onProgress: ({ bytesWritten, totalBytes }) =>
              setPhase({
                at: "downloading",
                progress: totalBytes > 0 ? bytesWritten / totalBytes : null,
                bytes: bytesWritten,
              }),
          });
          const done = await task.downloadAsync();
          if (!done) return;
          const head = new Uint8Array(await done.arrayBuffer()).slice(0, 5);
          if (String.fromCharCode(...head) !== "%PDF-") {
            done.delete();
            throw new Error("The PDF couldn’t be made. Try again in a minute.");
          }
          if (file.exists) file.delete();
          done.move(file);
          ready(file.uri);
        } catch (e) {
          if (abort.signal.aborted) return;
          setPhase({
            at: "error",
            message:
              e instanceof Error && e.message.startsWith("The ")
                ? e.message
                : "The PDF didn’t download. Check your signal and try again.",
          });
        }
      })();
    }, 0);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [token, title, round]);

  const at = phase.at === "making" ? 0 : phase.at === "downloading" ? 1 : 3;
  return (
    <Screen>
      <Stack.Screen
        options={{
          title,
          headerRight:
            phase.at === "ready"
              ? () => <HeaderButton title="Share" onPress={() => void sharePdf(phase.uri, title)} />
              : undefined,
        }}
      />
      {!API_URL ? (
        <Notice tone="warning">This app isn’t connected to the Sundeck Pro server.</Notice>
      ) : phase.at === "error" ? (
        <>
          <Notice tone="error">{phase.message}</Notice>
          <Button
            title="Try Again"
            onPress={() => {
              setPhase({ at: "making" });
              setRound((n) => n + 1);
            }}
          />
        </>
      ) : (
        <Card style={styles.card}>
          <StepList steps={STEPS} at={at} label="Getting the PDF" />
          {phase.at === "downloading" ? (
            <View style={styles.bar}>
              <ProgressBar value={phase.progress} label="Download" />
              <T variant="secondary" muted>
                {phase.progress != null
                  ? `${Math.round(phase.progress * 100)}%`
                  : phase.bytes
                    ? megabytes(phase.bytes)
                    : "Starting…"}
              </T>
            </View>
          ) : phase.at === "making" ? (
            <T variant="secondary" muted>
              The server lays out every page, photo, and signature. This takes a few seconds.
            </T>
          ) : null}
          {phase.at === "ready" ? (
            <View style={styles.row}>
              <Button title="Open PDF" onPress={() => void openPdf(phase.uri, title)} />
              <Button
                title="Share"
                kind="secondary"
                onPress={() => void sharePdf(phase.uri, title)}
              />
            </View>
          ) : null}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space["4"] },
  bar: { gap: space["2"] },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space["3"] },
});
