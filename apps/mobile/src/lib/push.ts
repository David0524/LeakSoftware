import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Linking, Platform } from "react-native";
import { tokens } from "@leakbook/tokens";
import { API_URL } from "./config";
import { requestStopAction } from "./liveStop";
import { getServices } from "./services";

// Notifications (owner, 2026-10-19; docs/plans/live-activities-and-notifications.md): this
// phone's Expo push token goes to the website (/api/push/devices), which sends texts, new and
// moved jobs, accepted quotes, payments, and signed reports through Expo's push service. A tap
// opens the job or the conversation. The current stop's ongoing notification is
// features/today/LiveStop.tsx.

/**
 * The brand's water blue, for the current stop's ongoing notification: the lighter blue, as on
 * the iPhone's Live Activity (owner, 2026-10-20).
 */
export const NOTIFICATION_COLOR = tokens.color.brand.water;
/** Alerts (pushes from the website) and the current stop (shown by the app itself). */
export const ALERTS_CHANNEL = "default";
export const STOP_CHANNEL = "current-stop";
/** The current stop's buttons. Category ids can't use ":" or "-". */
export const STOP_CATEGORY = "currentstop";

const TOKEN_KEY = "push:expoToken";
const supported = Platform.OS !== "web";

let ready: Promise<void> | null = null;

/** Channels, the current stop's buttons, and how notifications show while the app is open. */
export function setUpNotifications(): Promise<void> {
  if (!supported) return Promise.resolve();
  ready ??= (async () => {
    Notifications.setNotificationHandler({
      handleNotification: async (n) => {
        // The current stop is already on screen in the app: only in the notification list.
        const live = n.request.content.data?.kind === "live";
        return {
          shouldShowBanner: !live,
          shouldShowList: true,
          shouldPlaySound: !live,
          shouldSetBadge: false,
        };
      },
    });
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(ALERTS_CHANNEL, {
        name: "Alerts",
        description: "Customer texts, new and moved jobs, accepted quotes, payments, and reports.",
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: NOTIFICATION_COLOR,
      });
      await Notifications.setNotificationChannelAsync(STOP_CHANNEL, {
        name: "Current stop",
        description: "The stop you're on: where you're headed, the checklist, and what's next.",
        // Quiet: it updates as you work, so it never buzzes or sounds.
        importance: Notifications.AndroidImportance.LOW,
        sound: null,
        enableVibrate: false,
        showBadge: false,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
    // On My Way and Mark Complete open the app on that stop and do it there (owner,
    // 2026-10-20), beside Call; a tap on the notification itself opens the job.
    await Notifications.setNotificationCategoryAsync(STOP_CATEGORY, [
      {
        identifier: "on_my_way",
        buttonTitle: "On My Way",
        options: { opensAppToForeground: true },
      },
      {
        identifier: "mark_complete",
        buttonTitle: "Mark Complete",
        options: { opensAppToForeground: true },
      },
      { identifier: "call", buttonTitle: "Call", options: { opensAppToForeground: true } },
    ]);
  })().catch(() => undefined);
  return ready;
}

/** The EAS project this build belongs to; push tokens need it (set by `eas init`). */
function projectId(): string | null {
  const id =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  return id || null;
}

async function devices(method: "POST" | "DELETE", token: string): Promise<boolean> {
  if (!API_URL) return false;
  const bearer = await getServices().sync.accessToken();
  if (!bearer) return false;
  try {
    const res = await fetch(`${API_URL}/api/push/devices`, {
      method,
      headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
      body: JSON.stringify({ service: "expo", token, app: "Android app" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * After sign-in: ask for permission (Android 13 and later ask once a channel exists), get the
 * Expo push token, and file it for this person. Quietly does nothing without permission, an
 * EAS project id, or a connection; it tries again on the next launch.
 */
export async function registerForPush(): Promise<void> {
  if (!supported) return;
  await setUpNotifications();
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return;
    const id = projectId();
    if (!id) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (await devices("POST", token)) getServices().kv.set(TOKEN_KEY, token);
  } catch {
    // No Google Play services, no network: the next launch tries again.
  }
}

/** At sign out: this phone stops getting the person's notifications. */
export async function unregisterPush(): Promise<void> {
  if (!supported) return;
  const { kv } = getServices();
  const token = kv.get(TOKEN_KEY);
  if (!token) return;
  await Promise.race([devices("DELETE", token), new Promise((r) => setTimeout(r, 3000))]);
  kv.remove(TOKEN_KEY);
}

/** Whether notifications are allowed (More › Notifications offers the system settings). */
export async function notificationsAllowed(): Promise<boolean> {
  if (!supported) return true;
  try {
    return (await Notifications.getPermissionsAsync()).status === "granted";
  } catch {
    return true;
  }
}

/**
 * A tap on a notification or one of its buttons: open the job or the conversation, call, or
 * (the current stop's On My Way and Mark Complete) open Today on that stop and do it there.
 */
export function handleResponse(response: Notifications.NotificationResponse) {
  const data = (response.notification.request.content.data ?? {}) as {
    job?: string;
    conversation?: string;
    phone?: string;
  };
  if (
    (response.actionIdentifier === "on_my_way" || response.actionIdentifier === "mark_complete") &&
    data.job
  ) {
    requestStopAction(data.job, response.actionIdentifier);
    router.navigate("/");
    return;
  }
  if (response.actionIdentifier === "call" && data.phone) {
    void Linking.openURL(`tel:${data.phone}`);
    return;
  }
  if (data.conversation) router.push(`/messages/${data.conversation}`);
  else if (data.job) router.push(`/jobs/${data.job}`);
}

export { Notifications };
