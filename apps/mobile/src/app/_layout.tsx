import { useFonts } from "expo-font";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { initMonitoring, reportError } from "../lib/monitoring";
import { SessionProvider, useSession } from "../state/session";
import { Button, T } from "../ui/components";
import { color, ios, space } from "../ui/theme";

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
      <Button title="Try Again" onPress={() => void retry()} />
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

  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;
  return (
    <SessionProvider>
      {/* Dark on iPhone's light navigation bar, light on Android's navy one. */}
      <StatusBar style={ios ? "dark" : "light"} />
      <RootStack />
    </SessionProvider>
  );
}

/** Signed out: auth screens. Signed in without a company: setup. Otherwise: the app. */
function RootStack() {
  const { user, company } = useSession();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(user) && !company}>
        <Stack.Screen name="setup" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(user) && Boolean(company)}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}
