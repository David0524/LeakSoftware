import Constants from "expo-constants";
import { usePathname } from "expo-router";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { UsageRecorder, webSink } from "../../data/usage";
import { onReportedError } from "../../lib/usage-errors";
import { getServices } from "../../lib/services";
import { useSession } from "../../state/session";

/** The app's one recorder (errors from anywhere: lib/monitoring.ts). */
export const usage = new UsageRecorder(
  Platform.OS === "ios" ? "ios" : "android",
  Constants.expoConfig?.version ?? "dev",
);

onReportedError((detail) => usage.error(detail));

async function flush(companyId: string | null) {
  const token = await getServices().sync.accessToken();
  await usage.flush(webSink, token, companyId);
}

/**
 * Counts screen time for the Admin portal's Usage (owner, 2026-10-22): the route open while the
 * app is in front; sent every minute and when the app goes to the background.
 */
export function UsageTracker() {
  const path = usePathname();
  const { company } = useSession();
  const companyId = company?.id ?? null;
  useEffect(() => usage.screenChanged(path, AppState.currentState === "active"), [path]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      usage.foreground(state === "active");
      if (state !== "active") void flush(companyId);
    });
    const timer = setInterval(() => void flush(companyId), 60_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [companyId]);
  return null;
}
