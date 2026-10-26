import { router, useLocalSearchParams } from "expo-router";
import { formatPhone, friendlyError } from "@leakbook/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Text, View } from "react-native";
import {
  callFromCompany,
  markRead,
  sendCompanyText,
  setUnread,
  useConversations,
  useLine,
  useThread,
} from "../../../../../data/texting";
import { useTeam } from "../../../../../data/schedule";
import { Composer, useTabBarTop } from "../../../../../features/messages/Composer";
import { Thread } from "../../../../../features/messages/Thread";
import { recordOnMyWay } from "../../../../../features/today/OnMyWay";
import { readOnMyWayDraft } from "../../../../../lib/heroMessage";
import { getServices } from "../../../../../lib/services";
import { useCompany } from "../../../../../state/session";
import {
  Button,
  Notice,
  RoundButton,
  Screen,
  T,
  useScreenChrome,
} from "../../../../../ui/components";
import { color, space, type } from "../../../../../ui/theme";

/**
 * One conversation (spec 5.7; company texting, owner 2026-10-16): texts and calls in order,
 * the view starting at the newest, and the composer docked above the tab bar. Calls ring my
 * phone first, then connect from the company number. Opening it marks it read for the team.
 */
export default function Conversation() {
  const params = useLocalSearchParams<{
    id: string;
    omw?: string;
    drive?: string;
    body?: string;
  }>();
  const { id } = params;
  // Today's Message before arriving: the On My Way text, filled in (owner, 2026-10-20).
  const [draft, setDraft] = useState(() => readOnMyWayDraft(params));
  const company = useCompany();
  const line = useLine(company.id);
  const conversation = useConversations(company.id).find((c) => c.id === id);
  const items = useThread(company.id, id);
  const team = useTeam(company.id);
  const names = useMemo(() => new Map(team.map((t) => [t.user_id, t.name])), [team]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [callNote, setCallNote] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const unreadOnPurpose = useRef(false);
  const barTop = useTabBarTop();

  // Opening it marks it read for the whole team, and so does a new message while it's open.
  useEffect(() => {
    if (conversation && !unreadOnPurpose.current) markRead(company.id, conversation);
  }, [company.id, conversation]);

  // Pictures are private: signed links, fetched when there's a signal.
  const pathKey = items
    .flatMap((i) => (i.kind === "text" ? i.media.map((m) => m.path) : []))
    .join("|");
  useEffect(() => {
    if (!pathKey) return;
    getServices()
      .sync.textPictureUrls(pathKey.split("|"))
      .then(setUrls)
      .catch(() => {});
  }, [pathKey]);

  const active = line?.status === "active";
  const name = conversation?.name ?? "Conversation";
  const { header, ref, scrollProps, contentContainerStyle } = useScreenChrome({
    title: name,
    subtitle: conversation ? (
      <Text style={[type.body, { color: color.textMuted }]}>
        {conversation.customer_id ? `${formatPhone(conversation.phone)} · ` : null}
        {conversation.customer_id ? (
          <Text
            accessibilityRole="link"
            onPress={() => router.push(`/customers/${conversation.customer_id}`)}
            style={{ color: color.link, textDecorationLine: "underline" }}
          >
            Customer Details
          </Text>
        ) : (
          "Not a customer yet"
        )}
      </Text>
    ) : undefined,
    headerActions: conversation ? (
      <View style={{ gap: space["2"], alignSelf: "stretch" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space["2"] }}>
          <Button
            kind="secondary"
            title="Mark as Unread"
            onPress={() => {
              unreadOnPurpose.current = true;
              setUnread(company.id, conversation.id, true);
              router.back();
            }}
          />
          {active ? (
            <RoundButton
              icon="phone"
              label={`Call ${name} from the company number`}
              onPress={() =>
                callFromCompany(conversation.id)
                  .then((r) =>
                    setCallNote({
                      tone: "info",
                      text: r.demo
                        ? "Texting isn’t connected on the server, so no call was placed."
                        : `Your phone (${r.calling}) rings first. Answer to connect.`,
                    }),
                  )
                  .catch((e: unknown) =>
                    setCallNote({
                      tone: "error",
                      text: friendlyError(e),
                    }),
                  )
              }
            />
          ) : null}
        </View>
        {callNote ? <Notice tone={callNote.tone}>{callNote.text}</Notice> : null}
      </View>
    ) : undefined,
  });

  if (!conversation) {
    return (
      <Screen title="Conversation">
        <T muted>This conversation isn’t on this phone.</T>
      </Screen>
    );
  }

  async function send(body: string, picture: { uri: string; type: string } | null) {
    try {
      await sendCompanyText({
        conversationId: id,
        body,
        picture: picture ? { companyId: company.id, ...picture } : undefined,
        ...(draft ? { jobId: draft.jobId } : null),
      });
      // Sending it is On My Way: the card and the notification switch to "On the way". Once.
      if (draft) {
        recordOnMyWay(draft.jobId, company.id, draft.driveMin);
        setDraft(null);
      }
      return true;
    } catch (e) {
      Alert.alert("Not Sent", friendlyError(e));
      return false;
    }
  }

  const composer = conversation.opted_out ? (
    <Notice tone="warning">
      {`${name} replied STOP, so texts to them are off. They can text START to turn them back on.`}
    </Notice>
  ) : active ? null : (
    <Notice>Texting is off until the company number is working.</Notice>
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Animated.ScrollView
        ref={ref as never}
        {...scrollProps}
        contentContainerStyle={[
          contentContainerStyle,
          {
            gap: space["4"],
            paddingBottom: active && !conversation.opted_out ? barTop + 120 : barTop + 40,
          },
        ]}
        onContentSizeChange={() => ref.current?.scrollToEnd({ animated: false })}
      >
        {header}
        <Thread items={items} names={names} timeZone={company.timezone} urls={urls} />
        {composer}
      </Animated.ScrollView>
      {active && !conversation.opted_out ? (
        <Composer pictures={line.pictures} onSend={send} initialBody={draft?.body} />
      ) : null}
    </View>
  );
}
