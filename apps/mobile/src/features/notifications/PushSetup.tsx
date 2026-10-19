import { useEffect } from "react";
import { Platform } from "react-native";
import { Notifications, handleResponse, registerForPush, setUpNotifications } from "../../lib/push";
import { useSession } from "../../state/session";

/**
 * Mounted once while signed in: registers this phone for the person's notifications (asking
 * for permission the first time), and opens the job or conversation a tapped notification is
 * about, including the one that launched the app.
 */
export function PushSetup() {
  const { user } = useSession();
  const userId = user?.id;
  useEffect(() => {
    if (Platform.OS === "web" || !userId) return;
    void setUpNotifications();
    void registerForPush();
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync()
      .then((r) => {
        if (!r) return;
        handleResponse(r);
        void Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => undefined);
    return () => sub.remove();
  }, [userId]);
  return null;
}
