import { useFonts } from "expo-font";
import { router, Stack, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { initMonitoring, reportError } from "../lib/monitoring";
import { useFirstDownloadOpen } from "../state/firstDownload";
import { SessionProvider, useSession, useSyncStatus } from "../state/session";
import { Button, T } from "../ui/components";
import { appearance, color, space } from "../ui/theme";

initMonitoring();
void SplashScreen.preventAutoHideAsync();

/**
 * A screen that crashes shows this instead of a blank app (M11). Everything the tech saved is
 * in the phone's database, so nothing is lost; Try Again re-opens the screen.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error);
  }, [error]);
  return (
    <View
      accessibilityRole="alert"
      style={{
        flex: 1,
        justifyContent: "center",
        gap: space["3"],
        padding: space["5"],
        backgroundColor: color.bg,
      }}
    >
      <T variant="title">Something went wrong</T>
      <T>This screen didn’t load. Your work is saved on this phone and will still sync.</T>
      <Button title="Try Again" wide onPress={() => void retry()} />
    </View>
  );
}

const BRAND_FONTS = {
  "Barlow-SemiBold": require("../../../../brand/fonts/BarlowSemiCondensed-SemiBold.ttf"),
  "Barlow-Bold": require("../../../../brand/fonts/BarlowSemiCondensed-Bold.ttf"),
  "Barlow-ExtraBold": require("../../../../brand/fonts/BarlowSemiCondensed-ExtraBold.ttf"),
  "PublicSans-Regular": require("../../../../brand/fonts/PublicSans-Regular.ttf"),
  "PublicSans-Medium": require("../../../../brand/fonts/PublicSans-Medium.ttf"),
  "PublicSans-SemiBold": require("../../../../brand/fonts/PublicSans-SemiBold.ttf"),
  "PublicSans-Bold": require("../../../../brand/fonts/PublicSans-Bold.ttf"),
};

export default function RootLayout() {
  const [loaded, error] = useFonts(BRAND_FONTS);
  // Light by default; Dark when chosen in More › On This Device (spec 2.2). A change redraws
  // every screen in the new colors and returns to More, where the choice was made.
  const scheme = useSyncExternalStore(appearance.subscribe, () => appearance.scheme);
  const first = useRef(scheme);
  useEffect(() => {
    if (scheme === first.current) return;
    first.current = scheme;
    const t = setTimeout(() => router.navigate("/more"), 0);
    return () => clearTimeout(t);
  }, [scheme]);

  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;
  return (
    // Swipe actions on list rows need the gesture handler's root.
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      {/* Fields and sheet buttons follow the keyboard, edge to edge on Android (owner,
          2026-10-20); see ui/keyboard.tsx. */}
      <KeyboardProvider>
        <SessionProvider>
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          <RootStack key={scheme} />
        </SessionProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Signed out: auth screens. Waiting on a two-step code: the code screen. Signed in without a
 * company: setup. Otherwise: the app.
 */
function RootStack() {
  const { user, company, needsCode } = useSession();
  // Two-step sign-in: the code screen comes before anything else (owner, 2026-10-16).
  const signedIn = Boolean(user) && !needsCode;
  // The first download stays on Getting Ready until it's finished and its check has shown
  // (gestures spec section 11), even once the company's row has arrived.
  const status = useSyncStatus();
  const { open } = useFirstDownloadOpen(status.initialSyncDone);
  const ready = Boolean(company) && (status.initialSyncDone ? open : status.download === null);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!user && !needsCode}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={needsCode}>
        <Stack.Screen name="code" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !ready}>
        <Stack.Screen name="setup" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && ready}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}
