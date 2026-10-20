import { router } from "expo-router";
import { formatPhone, isManagerRole } from "@leakbook/core";
import { useEffect, useState } from "react";
import { Platform, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { callFromCompany, setUnread, useConversations, useLine } from "../../../../../data/texting";
import { API_URL } from "../../../../../lib/config";
import {
  conversationRowActions,
  menuTitle,
  type ConversationActionId,
} from "../../../../../lib/rowActions";
import { useCompany, useSession } from "../../../../../state/session";
import { Empty, Group, HeaderButton, Notice, Screen, T } from "../../../../../ui/components";
import { haptics } from "../../../../../ui/haptics";
import { useResultBanner } from "../../../../../ui/ResultBanner";
import { rowGestures, useRowMenu } from "../../../../../ui/RowMenu";
import { SwipeActions } from "../../../../../ui/SwipeRow";
import { color, face, MAX_TEXT_SCALE, space, type } from "../../../../../ui/theme";
import { ScreenTip } from "../../../../../ui/Tip";

/**
 * The shop's shared inbox (spec 5.7; company texting, owner 2026-10-16): every text and call
 * with customers on the company number, the same list the office sees. Swipe left for Read or
 * Unread (for the whole team), right to Call from the company number; touch and hold for Open,
 * Call, Mark Read or Mark Unread, and Open Customer (gestures spec section 12), as the
 * thread's own buttons do them.
 */
export default function Messages() {
  const company = useCompany();
  const { services, membership } = useSession();
  const manager = isManagerRole(membership?.role);
  const line = useLine(company.id);
  const conversations = useConversations(company.id);
  const working = line?.status === "active";
  const menu = useRowMenu();
  const banner = useResultBanner();
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
      overlay={banner.element}
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
                onPress={() => router.push("/settings/phone")}
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
            const actions = conversationRowActions({
              unread: c.unread,
              canCall: working,
              customerId: c.customer_id,
            });
            // The thread's Call button: the company number rings my phone first.
            const call = () =>
              callFromCompany(c.id)
                .then((r) =>
                  banner.show({
                    tone: "info",
                    message: r.demo
                      ? "Texting isn’t connected on the server, so no call was placed."
                      : `Your phone (${r.calling}) rings first. Answer to connect.`,
                  }),
                )
                .catch((e: unknown) =>
                  banner.show({
                    tone: "error",
                    message: e instanceof Error ? e.message : String(e),
                  }),
                );
            const run = (id: ConversationActionId) => {
              if (id === "open") router.push(`/messages/${c.id}`);
              if (id === "call") void call();
              if (id === "toggle") setUnread(company.id, c.id, !c.unread);
              if (id === "customer" && c.customer_id) router.push(`/customers/${c.customer_id}`);
            };
            const g = rowGestures(actions, run, () =>
              menu.open(menuTitle(c.name), actions.menu, run),
            );
            return (
              <SwipeActions key={c.id} leading={g.leading} trailing={g.trailing}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${c.name}${c.unread ? ", unread" : ""}, ${c.last_preview ?? ""}`}
                  accessibilityActions={g.accessibilityActions}
                  onAccessibilityAction={g.onAccessibilityAction}
                  onPress={() => router.push(`/messages/${c.id}`)}
                  onLongPress={g.onLongPress}
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
              </SwipeActions>
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
