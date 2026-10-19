import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import type { ThreadItem } from "../../data/texting";
import { API_URL } from "../../lib/config";
import { getServices } from "../../lib/services";
import { Button, Empty, T } from "../../ui/components";
import { color, MAX_TEXT_SCALE, shape, space, type } from "../../ui/theme";
import { WebIcon } from "../../ui/WebIcon";

// A conversation's texts and calls (spec 5.7; the website's components/inbox.tsx Thread):
// a day's first message has the day above it; ours on the right in blue, theirs on the left.

const STATUS: Record<string, string> = {
  queued: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  undelivered: "Not delivered",
  failed: "Not sent",
};

const minutes = (s: number | null) =>
  s == null ? "" : s < 60 ? `${s} sec` : `${Math.round(s / 60)} min`;

type Call = Extract<ThreadItem, { kind: "call" }>;

function callLabel(c: Call, names: Map<string, string>) {
  const who = c.user_id ? names.get(c.user_id) : null;
  if (c.recording_sid || c.status === "voicemail")
    return `Voicemail · ${minutes(c.duration_seconds)}`;
  if (c.status === "missed") return "Missed call";
  if (c.status === "failed") return c.direction === "out" ? "Call didn’t connect" : "Missed call";
  if (c.status === "ringing") return c.direction === "out" ? "Calling…" : "Incoming call";
  const verb = c.direction === "out" ? `${who ?? "Team"} called` : "Incoming call";
  return `${verb}${c.duration_seconds ? ` · ${minutes(c.duration_seconds)}` : ""}`;
}

function VoicemailIcon() {
  return (
    <Svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color.textMuted}
      strokeWidth={2}
      strokeLinecap="round"
    >
      <Circle cx={6.5} cy={12} r={3.5} />
      <Circle cx={17.5} cy={12} r={3.5} />
      <Path d="M6.5 15.5h11" />
    </Svg>
  );
}

/** A voicemail's audio, from the server with this phone's sign-in (it needs a signal). */
function Voicemail({ id }: { id: string }) {
  const [source, setSource] = useState<{ uri: string; headers: Record<string, string> } | null>(
    null,
  );
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    if (!source) {
      const token = await getServices().sync.accessToken();
      if (!API_URL || !token) {
        setError("Sign in again to play it.");
        return;
      }
      setSource({
        uri: `${API_URL}/api/calls/${id}/recording`,
        headers: { authorization: `Bearer ${token}` },
      });
      setTimeout(() => player.play(), 300);
      return;
    }
    if (status.didJustFinish || (status.duration && status.currentTime >= status.duration))
      void player.seekTo(0);
    player.play();
  }
  return (
    <View style={{ alignItems: "center" }}>
      <Button
        kind="quiet"
        small
        title={status.playing ? "Pause" : "Play Voicemail"}
        onPress={() => void toggle()}
      />
      {error ? (
        <T variant="footnote" style={{ color: color.fail }}>
          {error}
        </T>
      ) : null}
    </View>
  );
}

export function Thread({
  items,
  names,
  timeZone,
  urls,
}: {
  items: ThreadItem[];
  names: Map<string, string>;
  timeZone: string;
  /** Signed links to the texts' pictures, by storage path. */
  urls: Map<string, string>;
}) {
  if (items.length === 0) return <Empty>No messages yet. Send the first text below.</Empty>;
  const dayOf = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      timeZone,
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  return (
    <View style={{ gap: space["2"] }} accessibilityLabel="Messages">
      {items.map((item, i) => {
        const day = dayOf(item.created_at);
        const showDay = i === 0 || dayOf(items[i - 1]!.created_at) !== day;
        const time = new Date(item.created_at).toLocaleTimeString("en-US", {
          timeZone,
          hour: "numeric",
          minute: "2-digit",
        });
        return (
          <View key={`${item.kind}-${item.id}`}>
            {showDay ? (
              <T variant="footnote" muted style={styles.day}>
                {day}
              </T>
            ) : null}
            {item.kind === "call" ? (
              <View style={[styles.call, { backgroundColor: color.emptyFill }]}>
                <View style={styles.callLine}>
                  {item.recording_sid ? (
                    <VoicemailIcon />
                  ) : (
                    <WebIcon name="phone" size={16} color={color.textMuted} />
                  )}
                  <Text
                    style={[type.secondary, { color: color.textMuted, flexShrink: 1 }]}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  >
                    {callLabel(item, names)} · {time}
                  </Text>
                </View>
                {item.recording_sid ? <Voicemail id={item.id} /> : null}
                {item.transcript ? <T variant="secondary">“{item.transcript}”</T> : null}
              </View>
            ) : (
              <View style={{ alignItems: item.direction === "out" ? "flex-end" : "flex-start" }}>
                {item.media.map((m) =>
                  urls.get(m.path) ? (
                    <Image
                      key={m.path}
                      source={{ uri: urls.get(m.path) }}
                      style={styles.picture}
                      resizeMode="cover"
                      accessibilityLabel="Photo in a text"
                    />
                  ) : null,
                )}
                {item.body ? (
                  <View
                    style={[
                      styles.bubble,
                      { backgroundColor: item.direction === "out" ? color.primary : color.fill },
                    ]}
                  >
                    <Text
                      selectable
                      style={[
                        type.body,
                        { color: item.direction === "out" ? color.onPrimary : color.text },
                      ]}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE}
                    >
                      {item.body}
                    </Text>
                  </View>
                ) : null}
                <T
                  variant="footnote"
                  muted
                  style={[
                    styles.meta,
                    (item.status === "failed" || item.status === "undelivered") && {
                      color: color.fail,
                    },
                  ]}
                >
                  {item.direction === "out"
                    ? [
                        item.sent_by ? names.get(item.sent_by) : null,
                        STATUS[item.status] ?? item.status,
                        time,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : time}
                  {item.error ? ` (${item.error})` : ""}
                </T>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  day: { textAlign: "center", paddingTop: space["3"], paddingBottom: space["1"] },
  call: {
    alignSelf: "center",
    maxWidth: 448,
    width: "100%",
    borderRadius: 16,
    paddingHorizontal: space["4"],
    paddingVertical: 10,
    gap: space["2"],
  },
  callLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space["2"],
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: shape.bubble,
    paddingHorizontal: space["4"],
    paddingVertical: space["2"],
  },
  picture: { width: 224, height: 224, maxWidth: "80%", borderRadius: 16, marginBottom: 4 },
  meta: { marginTop: 2, paddingHorizontal: space["2"] },
});
