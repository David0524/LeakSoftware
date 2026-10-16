import { router } from "expo-router";
import { formatPhone } from "@leakbook/core";
import { View } from "react-native";
import { useConversations, useLine } from "../../../data/texting";
import { useCompany } from "../../../state/session";
import { Group, ListRow, Notice, Screen, Section, T } from "../../../ui/components";
import { color, space } from "../../../ui/theme";

/**
 * The shop's shared inbox (company texting, owner 2026-10-16): every text and call with
 * customers on the company number, the same list the office sees.
 */
export default function Messages() {
  const company = useCompany();
  const line = useLine(company.id);
  const conversations = useConversations(company.id);
  const when = (iso: string) => {
    const at = new Date(iso);
    return at.toDateString() === new Date().toDateString()
      ? at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : at.toLocaleDateString([], { month: "short", day: "numeric" });
  };
  return (
    <Screen>
      {line?.status === "active" ? (
        <T variant="muted">Company number: {formatPhone(line.number)}</T>
      ) : line?.status === "pending" ? (
        <Notice>{formatPhone(line.number)} is being set up for texting.</Notice>
      ) : (
        <Notice>No company number yet. An owner sets one up on the website.</Notice>
      )}
      {conversations.length === 0 ? (
        <T variant="muted">No messages yet.</T>
      ) : (
        <Section title="Conversations" grouped>
          <Group separatorInset={space["4"] + 18}>
            {conversations.map((c) => (
              <ListRow
                key={c.id}
                accessibilityLabel={`${c.name}${c.unread ? ", unread" : ""}, ${c.last_preview ?? ""}`}
                onPress={() => router.push(`/messages/${c.id}`)}
                leading={
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      marginRight: 8,
                      backgroundColor: c.unread ? color.link : "transparent",
                    }}
                  />
                }
                detail={<T variant="muted">{when(c.last_at)}</T>}
              >
                <T variant={c.unread ? "strong" : "body"} numberOfLines={1}>
                  {c.name}
                </T>
                <T variant="muted" numberOfLines={1}>
                  {c.last_preview ?? ""}
                </T>
              </ListRow>
            ))}
          </Group>
        </Section>
      )}
    </Screen>
  );
}
