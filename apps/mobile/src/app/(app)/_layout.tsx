import { router, Stack } from "expo-router";
import { HeaderButton } from "../../ui/components";
import { color, font, header, ios } from "../../ui/theme";

/**
 * iPhone follows iOS navigation (owner, 2026-10-14, as on the website): a light bar with large
 * titles on the top-level screens that shrink as you scroll, the back button named after the
 * previous screen, and New Job as a sheet. Android keeps its navy app bar and arrow back.
 */
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: header.background },
        headerTintColor: header.tint,
        headerTitleStyle: { fontFamily: font.displayBold, fontSize: 20, color: header.title },
        headerLargeTitleStyle: { fontFamily: font.displayExtraBold, color: header.title },
        headerLargeStyle: { backgroundColor: header.background },
        headerLargeTitleShadowVisible: false,
        headerBackButtonDisplayMode: ios ? "default" : "minimal",
        contentStyle: { backgroundColor: color.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Jobs", headerLargeTitleEnabled: true }} />
      <Stack.Screen
        name="jobs/new"
        // A sheet on iPhone (swipe down or Cancel to close); a full screen on Android.
        options={{ title: "New Job", presentation: ios ? "modal" : "card" }}
      />
      <Stack.Screen name="jobs/[id]/index" options={{ title: "Job" }} />
      <Stack.Screen name="jobs/[id]/component/[componentId]" options={{ title: "Component" }} />
      <Stack.Screen name="jobs/[id]/test/[testId]" options={{ title: "Test" }} />
      <Stack.Screen name="jobs/[id]/finding/[findingId]" options={{ title: "Finding" }} />
      <Stack.Screen name="jobs/[id]/media/[mediaId]" options={{ title: "Photo" }} />
      <Stack.Screen name="jobs/[id]/signature" options={{ title: "Signature" }} />
      <Stack.Screen name="jobs/[id]/review" options={{ title: "Review and Sign" }} />
      <Stack.Screen
        name="settings"
        options={{ title: "Settings", headerLargeTitleEnabled: true }}
      />
      <Stack.Screen
        name="reauth"
        options={{
          title: "Sign In Again",
          presentation: "modal",
          // An iOS sheet has no back button; Cancel closes it (Android has its own back).
          headerLeft: ios
            ? () => <HeaderButton title="Cancel" onPress={() => router.back()} />
            : undefined,
        }}
      />
    </Stack>
  );
}
