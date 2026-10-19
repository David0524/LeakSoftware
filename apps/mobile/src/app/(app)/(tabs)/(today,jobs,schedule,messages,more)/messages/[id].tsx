import { useLocalSearchParams } from "expo-router";
import { formatPhone } from "@leakbook/core";
import { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, TextInput, View } from "react-native";
import {
  callFromCompany,
  markRead,
  sendCompanyText,
  useConversations,
  useLine,
  useThread,
  type ThreadItem,
} from "../../../../../data/texting";
import { chooseFromLibrary } from "../../../../../lib/media";
import { getServices } from "../../../../../lib/services";
import { useCompany } from "../../../../../state/session";
import { Button, HeaderButton, Notice, Screen, T } from "../../../../../ui/components";
import { Icon } from "../../../../../ui/Icon";
import { color, radius, space, tint } from "../../../../../ui/theme";

// One conversation (company texting, owner 2026-10-16): texts and calls in order, and a reply
// from the company number. Calls ring my phone first, then connect from the company number.

const STATUS: Record<string, string> = {
  queued: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  undelivered: "Not delivered",
  failed: "Not sent",
};

function callLabel(c: Extract<ThreadItem, { kind: "call" }>) {
  const min = (s: number | null) =>
    s == null ? "" : s < 60 ? ` · ${s} sec` : ` · ${Math.round(s / 60)} min`;
  if (c.recording_sid || c.status === "voicemail") return `Voicemail${min(c.duration_seconds)}`;
  if (c.status === "missed") return "Missed call";
  if (c.status === "failed") return c.direction === "out" ? "Call didn’t connect" : "Missed call";
  if (c.status === "ringing") return c.direction === "out" ? "Calling…" : "Incoming call";
  return `${c.direction === "out" ? "Outgoing call" : "Incoming call"}${min(c.duration_seconds)}`;
}

export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const company = useCompany();
  const line = useLine(company.id);
  const conversation = useConversations(company.id).find((c) => c.id === id);
  const items = useThread(company.id, id);
  const team = useMemo(
    () =>
      new Map(
        getServices()
          .sync.team()
          .map((p) => [p.id, p]),
      ),
    [],
  );
  const [body, setBody] = useState("");
  const [picture, setPicture] = useState<{ uri: string; type: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (conversation) markRead(company.id, conversation);
  }, [company.id, conversation]);

  // Pictures are private: signed links, fetched when there's a signal.
  const paths = items.flatMap((i) => (i.kind === "text" ? i.media.map((m) => m.path) : []));
  const pathKey = paths.join("|");
  useEffect(() => {
    if (!pathKey) return;
    getServices()
      .sync.textPictureUrls(pathKey.split("|"))
      .then(setUrls)
      .catch(() => {});
  }, [pathKey]);

  if (!conversation) {
    return (
      <Screen>
        <T variant="muted">This conversation isn’t on this phone.</T>
      </Screen>
    );
  }
  const active = line?.status === "active";

  async function send() {
    if (!body.trim() && !picture) return;
    setSending(true);
    try {
      await sendCompanyText({
        conversationId: id,
        body,
        picture: picture ? { companyId: company.id, ...picture } : undefined,
      });
      setBody("");
      setPicture(null);
    } catch (e) {
      Alert.alert("Not sent", e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function addPicture() {
    try {
      const file = await chooseFromLibrary("photo");
      if (file) setPicture({ uri: file.uri, type: file.mime });
    } catch (e) {
      Alert.alert("Couldn’t add the photo", e instanceof Error ? e.message : String(e));
    }
  }

  function placeCall() {
    callFromCompany(id)
      .then((r) =>
        Alert.alert(
          r.demo ? "Demo" : "Calling you",
          r.demo
            ? "Texting isn’t connected on the server, so no call was placed."
            : `Your phone (${r.calling}) rings first. Answer to connect.`,
        ),
      )
      .catch((e: unknown) =>
        Alert.alert("Couldn’t call", e instanceof Error ? e.message : String(e)),
      );
  }

  return (
    <Screen
      title={conversation.name}
      headerRight={
        active
          ? () => (
              <HeaderButton title={`Call ${conversation.name}`} icon="call" onPress={placeCall} />
            )
          : undefined
      }
    >
      {conversation.customer_id ? <T variant="muted">{formatPhone(conversation.phone)}</T> : null}
      {items.map((item) => {
        const time = new Date(item.created_at).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        if (item.kind === "call") {
          return (
            <View key={`c-${item.id}`} style={styles.call}>
              <T variant="muted" style={{ textAlign: "center" }}>
                {callLabel(item)} · {time}
              </T>
              {item.transcript ? <T variant="small">“{item.transcript}”</T> : null}
              {item.recording_sid ? (
                <T variant="muted" style={{ textAlign: "center" }}>
                  Play the recording in Messages on the website.
                </T>
              ) : null}
            </View>
          );
        }
        const out = item.direction === "out";
        const sender = item.sent_by ? team.get(item.sent_by) : undefined;
        return (
          <View key={`t-${item.id}`} style={{ alignItems: out ? "flex-end" : "flex-start" }}>
            {item.media.map((m) =>
              urls.get(m.path) ? (
                <Image
                  key={m.path}
                  source={{ uri: urls.get(m.path) }}
                  style={styles.picture}
                  accessibilityLabel="Photo in a text"
                />
              ) : null,
            )}
            {item.body ? (
              <View style={[styles.bubble, out ? styles.out : styles.in]}>
                <T variant="body" style={out ? { color: color.onPrimary } : undefined}>
                  {item.body}
                </T>
              </View>
            ) : null}
            <T
              variant="muted"
              style={
                item.status === "failed" || item.status === "undelivered"
                  ? { color: color.fail }
                  : undefined
              }
            >
              {out
                ? [sender?.full_name ?? sender?.email, STATUS[item.status] ?? item.status, time]
                    .filter(Boolean)
                    .join(" · ")
                : time}
            </T>
          </View>
        );
      })}
      {conversation.opted_out ? (
        <Notice tone="warning">
          {conversation.name} replied STOP, so texts to them are off. They can text START to turn
          them back on.
        </Notice>
      ) : active ? (
        <View style={{ gap: space["2"] }}>
          {picture ? (
            <View style={styles.row}>
              <Image source={{ uri: picture.uri }} style={styles.thumb} />
              <Button title="Remove Photo" kind="quiet" onPress={() => setPicture(null)} />
            </View>
          ) : null}
          <View style={styles.row}>
            {line.pictures ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add a Photo"
                onPress={() => void addPicture()}
                style={styles.round}
              >
                <Icon name="photo" size={20} color={color.link} />
              </Pressable>
            ) : null}
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Text message"
              placeholderTextColor={color.placeholder}
              accessibilityLabel="Message"
              multiline
              maxLength={1600}
              style={styles.input}
            />
          </View>
          <Button title="Send" onPress={() => void send()} loading={sending} />
        </View>
      ) : (
        <Notice>Texting is off until the company number is working.</Notice>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  call: {
    alignSelf: "center",
    maxWidth: 420,
    gap: space["1"],
    paddingVertical: space["2"],
    paddingHorizontal: space["4"],
    borderRadius: radius.lg,
    backgroundColor: color.fill,
  },
  bubble: { maxWidth: "85%", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  out: { backgroundColor: color.primary },
  in: { backgroundColor: color.fill },
  picture: { width: 220, height: 220, borderRadius: 16, marginBottom: 4 },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: space["2"] },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tint(color.link, 0.12),
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: color.controlBorder,
    backgroundColor: color.surface,
    color: color.text,
    fontSize: 17,
  },
});
