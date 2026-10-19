import { router } from "expo-router";
import { formatPhone, isManagerRole } from "@leakbook/core";
import { useEffect } from "react";
import { View } from "react-native";
import { setUnread, useConversations, useLine } from "../../../../../data/texting";
import { useCompany, useSession } from "../../../../../state/session";
import {
  Empty,
  Group,
  HeaderButton,
  ListRow,
  Notice,
  Screen,
  T,
} from "../../../../../ui/components";
import { color, space } from "../../../../../ui/theme";
import { ScreenTip } from "../../../../../ui/Tip";

/**
 * The shop's shared inbox (spec 5.7; company texting, owner 2026-10-16): every text and call
 * with customers on the company number, the same list the office sees.
 */
export default function Messages() {
  const company = useCompany();
  const { services, membership } = useSession();
  const manager = isManagerRole(membership?.role);
  const line = useLine(company.id);
  const conversations = useConversations(company.id);
  const working = line?.status === "active";

  // Refreshes on open and every 20 seconds while showing (until push notifications exist).
  useEffect(() => {
    void services.sync.syncNow();
    const t = setInterval(() => void services.sync.syncNow(), 20_000);
    return () => clearInterval(t);
  }, [services]);

  const now = new Date();
  const when = (iso: string) => {
    const at = new Date(iso);
    const days = Math.floor((now.getTime() - at.getTime()) / 86_400_000);
    if (at.toDateString() === now.toDateString())
      return at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (days < 2) return "Yesterday";
    return at.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  return (
    <Screen
      title="Messages"
      subtitle={working ? `Your company number: ${formatPhone(line.number)}` : undefined}
      headerRight={
        working
          ? () => (
              <HeaderButton
                title="New Message"
                icon="compose"
                onPress={() => router.push("/messages/new")}
              />
            )
          : () => null
      }
    >
      <ScreenTip screen="messages" />
      {line?.status === "pending" ? (
        <Notice>
          {`${formatPhone(line.number)} is being set up for texting. It usually takes a few days; texts and calls will appear here once it’s ready.`}
        </Notice>
      ) : working ? null : (
        <Notice>
          {manager
            ? "Text and call customers from one company number the whole team shares. Set up a number on the website, in Settings › Phone and Texting."
            : "Text and call customers from one company number the whole team shares. Ask an owner to set up a company number."}
        </Notice>
      )}
      {conversations.length === 0 ? (
        <Empty>No conversations yet.</Empty>
      ) : (
        <Group separatorInset={space["4"] + 18}>
          {conversations.map((c) => (
            <ListRow
              key={c.id}
              accessibilityLabel={`${c.name}${c.unread ? ", unread" : ""}, ${c.last_preview ?? ""}`}
              onPress={() => router.push(`/messages/${c.id}`)}
              chevron={false}
              // As in iOS Messages: swipe right for Unread (or Read), for the whole team.
              leadingAction={{
                label: c.unread ? "Read" : "Unread",
                onPress: () => setUnread(company.id, c.id, !c.unread),
              }}
              leading={
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    alignSelf: "flex-start",
                    marginTop: 8,
                    backgroundColor: c.unread ? color.link : "transparent",
                  }}
                />
              }
            >
              <View style={{ flexDirection: "row", gap: space["2"], alignItems: "baseline" }}>
                <T
                  variant={c.unread ? "bodyEmphasis" : "body"}
                  numberOfLines={1}
                  style={{ flex: 1 }}
                >
                  {c.name}
                </T>
                <T variant="secondary" muted>
                  {when(c.last_at)}
                </T>
              </View>
              <T variant="secondary" muted numberOfLines={1}>
                {c.last_preview ?? ""}
              </T>
            </ListRow>
          ))}
        </Group>
      )}
    </Screen>
  );
}
