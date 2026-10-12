import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SessionProvider, useSession } from "../state/session";

void SplashScreen.preventAutoHideAsync();

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
      <StatusBar style="light" />
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
