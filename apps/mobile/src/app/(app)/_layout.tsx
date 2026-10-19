import { router, Stack } from "expo-router";
import { HeaderButton } from "../../ui/components";
import { stackScreenOptions } from "../../ui/navigation";
import { ios } from "../../ui/theme";

export const unstable_settings = { anchor: "(tabs)" };

/**
 * The signed-in app: the five tabs (spec 4), and over them what covers the tab bar: Add/Edit
 * Test and Finding (sheets on iPhone), the photo viewer, the signature and Review and Sign
 * screens, the first-launch cards, and Sign In Again.
 */
export default function AppLayout() {
  const sheet = { presentation: ios ? ("modal" as const) : ("card" as const) };
  return (
    <Stack screenOptions={stackScreenOptions()}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "Back" }} />
      <Stack.Screen
        name="jobs/[id]/(edit)"
        // Test and Finding: a sheet with its own stack on iPhone (see (edit)/_layout.tsx), so a
        // photo opened from it stays in the sheet; a full-screen push on Android.
        options={{ headerShown: false, ...sheet }}
      />
      <Stack.Screen
        name="jobs/[id]/media/[mediaId]"
        options={{ title: "Photo", headerLargeTitleEnabled: false }}
      />
      <Stack.Screen
        name="jobs/[id]/signature"
        options={{ title: "Signature", headerLargeTitleEnabled: false }}
      />
      <Stack.Screen
        name="jobs/[id]/review"
        options={{ title: "Review and Sign", headerLargeTitleEnabled: false }}
      />
      <Stack.Screen
        name="welcome"
        // The first-launch cards (walkthrough, 2026-10-16): a sheet on iPhone.
        options={{ title: "Welcome", headerLargeTitleEnabled: false, ...sheet }}
      />
      <Stack.Screen
        name="reauth"
        options={{
          title: "Sign In Again",
          presentation: "modal",
          headerLargeTitleEnabled: false,
          // An iOS sheet has no back button; Cancel closes it (Android has its own back).
          headerLeft: ios
            ? () => <HeaderButton title="Cancel" onPress={() => router.back()} />
            : undefined,
        }}
      />
    </Stack>
  );
}
