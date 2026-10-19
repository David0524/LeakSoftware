import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, StyleSheet, View } from "react-native";
import { NOTIFICATION_KINDS, notificationOn } from "@leakbook/core";
import { useNotificationPrefs } from "../../../../../data/notificationPrefs";
import { notificationsAllowed } from "../../../../../lib/push";
import { Group, ListRow, Notice, Screen, Section, T, Toggle } from "../../../../../ui/components";
import { space } from "../../../../../ui/theme";

/**
 * More › Notifications (owner, 2026-10-19), as the website's: which kinds reach this person's
 * phones. Everyone sets their own; on unless turned off. When this phone doesn't allow
 * Sundeck Pro's notifications, a row opens the system settings.
 */
export default function NotificationsScreen() {
  const { prefs, set, error } = useNotificationPrefs();
  const [allowed, setAllowed] = useState(true);
  const check = useCallback(() => void notificationsAllowed().then(setAllowed), []);
  useEffect(() => {
    check();
    // Back from the system settings: look again.
    const sub = AppState.addEventListener("change", (s) => s === "active" && check());
    return () => sub.remove();
  }, [check]);
  return (
    <Screen title="Notifications">
      {allowed ? null : (
        <Section
          title="This phone"
          footer="Sundeck Pro can’t show notifications on this phone until you allow them."
        >
          <Group>
            <ListRow
              title="Allow Notifications in Settings"
              tone="link"
              onPress={() => void Linking.openSettings()}
            />
          </Group>
        </Section>
      )}
      {prefs ? (
        <Section
          title="Notify me about"
          footer="Notifications go to the Sundeck Pro app on your phones where you’re signed in."
        >
          <Group>
            {NOTIFICATION_KINDS.map((k) => (
              <View key={k.key} style={styles.setting}>
                <Toggle
                  label={k.label}
                  value={notificationOn(prefs, k.key)}
                  onChange={(on) => void set(k.key, on)}
                />
                <T variant="secondary" muted>
                  {k.hint}
                </T>
              </View>
            ))}
          </Group>
        </Section>
      ) : (
        <Notice tone="info">Your notification settings load when you’re online.</Notice>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  setting: { paddingHorizontal: space["4"], paddingBottom: space["3"] },
});
