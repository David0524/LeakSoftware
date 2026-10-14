import * as Sentry from "@sentry/react-native";
import { Alert } from "react-native";
import { isStorageFull } from "@leakbook/sync";

// Crash and error reports (M11). Off unless EXPO_PUBLIC_SENTRY_DSN is set at build time.
// Errors only: no performance tracing, no session replay, and no user or customer details.
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initMonitoring() {
  if (dsn) {
    Sentry.init({
      dsn,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      attachScreenshot: false,
      attachViewHierarchy: false,
    });
  }
  handleFullStorage();
}

/**
 * A save that fails because the phone is full would otherwise crash the app (an error in a
 * button handler is fatal in release builds). Explain it instead; the save rolled back whole,
 * and everything saved before is still on the phone.
 */
function handleFullStorage() {
  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    if (isStorageFull(error) || (error instanceof Error && error.name === "StorageFullError")) {
      Alert.alert(
        "Phone storage is full",
        "This wasn’t saved. Free up some space (old photos, videos, or apps), then try again. Nothing saved before is lost.",
      );
      return;
    }
    previous(error, isFatal);
  });
}

export function reportError(error: unknown) {
  if (dsn) Sentry.captureException(error);
}
