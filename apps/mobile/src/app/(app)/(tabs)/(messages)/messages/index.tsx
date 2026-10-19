import { router } from "expo-router";
import { formatPhone, isManagerRole } from "@leakbook/core";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { setUnread, useConversations, useLine } from "../../../../../data/texting";
import { API_URL } from "../../../../../lib/config";
import { useCompany, useSession } from "../../../../../state/session";
import { Empty, Group, HeaderButton, Notice, Screen, T } from "../../../../../ui/components";
import { haptics } from "../../../../../ui/haptics";
import { useMenu } from "../../../../../ui/Select";
import { SwipeLeading } from "../../../../../ui/SwipeRow";
import { color, face, MAX_TEXT_SCALE, space, type } from "../../../../../ui/theme";
import { ScreenTip } from "../../../../../ui/Tip";

/**
 * The shop's shared inbox (spec 5.7; company texting, owner 2026-10-16): every text and call
 * with customers on the company number, the same list the office sees. Swipe right (or press
 * and hold) for Unread or Read, for the whole team.
 */
export default function Messages() {
  const company = useCompany();
  const { services, membership } = useSession();
  const manager = isManagerRole(membership?.role);
  const line = useLine(company.id);
  const conversations = useConversations(company.id);
  const working = line?.status === "active";
  const menu = useMenu();
  const [refreshing, setRefreshing] = useState(false);

  // Refreshes on open and every 20 seconds while showing (until push notifications exist).
  useEffect(() => {
    void services.sync.syncNow();
    const t = setInterval(() => void services.sync.syncNow(), 20_000);
    return () => clearInterval(t);
  }, [services]);

  async function refresh() {
    haptics.light();
    setRefreshing(true);
    await services.sync.syncNow();
    setRefreshing(false);
  }

  const tz = company.timezone;
  const now = new Date();
  const dayKey = (d: Date) => d.toLocaleDateString("en-US", { timeZone: tz });
  const when = (iso: string) => {
    const at = new Date(iso);
    if (dayKey(at) === dayKey(now))
      return at.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
    if (dayKey(at) === dayKey(new Date(now.getTime() - 86_400_000))) return "Yesterday";
    return at.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <ScreenTip screen="messages" />
      {line?.status === "pending" ? (
        <Notice>
          {`${formatPhone(line.number)} is being set up for texting. It usually takes a few days; texts and calls will appear here once it’s ready.`}
        </Notice>
      ) : working ? null : (
        <Notice>
          <T style={{ flex: 1 }}>
            Text and call customers from one company number the whole team shares.{" "}
            {manager && API_URL ? (
              <Text
                accessibilityRole="link"
                onPress={() => void Linking.openURL(`${API_URL}/settings/phone`)}
                style={[face.semiBold, { color: color.link, textDecorationLine: "underline" }]}
              >
                Set Up a Number
              </Text>
            ) : (
              "Ask an owner to set up a company number."
            )}
          </T>
        </Notice>
      )}
      {conversations.length === 0 ? (
        <Empty>No conversations yet.</Empty>
      ) : (
        <Group separatorInset={space["4"] + 18}>
          {conversations.map((c) => {
            const toggle = () => setUnread(company.id, c.id, !c.unread);
            return (
              <SwipeLeading key={c.id} label={c.unread ? "Read" : "Unread"} onPress={toggle}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${c.name}${c.unread ? ", unread" : ""}, ${c.last_preview ?? ""}`}
                  accessibilityActions={[
                    { name: "toggle", label: c.unread ? "Mark as Read" : "Mark as Unread" },
                  ]}
                  onAccessibilityAction={toggle}
                  onPress={() => router.push(`/messages/${c.id}`)}
                  onLongPress={() => {
                    haptics.light();
                    menu.open({
                      title: c.name,
                      items: [
                        {
                          label: c.unread ? "Mark as Read" : "Mark as Unread",
                          onPress: toggle,
                        },
                      ],
                    });
                  }}
                  android_ripple={{ color: color.ripple }}
                  style={({ pressed }) => [
                    styles.row,
                    { backgroundColor: color.surface },
                    pressed && Platform.OS !== "android" && { backgroundColor: color.rowPressed },
                  ]}
                >
                  <View
                    style={[styles.dot, { backgroundColor: c.unread ? color.link : "transparent" }]}
                  />
                  <View style={{ flex: 1 }}>
                    <View style={styles.top}>
                      <Text
                        numberOfLines={1}
                        style={[
                          c.unread ? type.bodyEmphasis : type.body,
                          { color: color.text, flex: 1 },
                        ]}
                        maxFontSizeMultiplier={MAX_TEXT_SCALE}
                      >
                        {c.name}
                      </Text>
                      <T variant="secondary" muted>
                        {when(c.last_at)}
                      </T>
                    </View>
                    <T variant="secondary" muted numberOfLines={1}>
                      {c.last_preview ?? ""}
                    </T>
                  </View>
                </Pressable>
              </SwipeLeading>
            );
          })}
        </Group>
      )}
      {menu.element}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: "row",
    gap: space["2"],
    paddingHorizontal: space["4"],
    paddingVertical: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 8 },
  top: { flexDirection: "row", gap: space["2"], alignItems: "baseline" },
});
