import { router, Stack } from "expo-router";
import { HeaderButton } from "../../ui/components";
import { stackScreenOptions } from "../../ui/navigation";
import { ios } from "../../ui/theme";

/**
 * iPhone follows iOS navigation (owner, 2026-10-14, as on the website): a translucent frosted
 * bar with large titles on the top-level screens that shrink as you scroll, the back button
 * named after the previous screen, and New Job, Test, and Finding as sheets. Android keeps its
 * navy app bar, arrow back, and full-screen pushes.
 */
export default function AppLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: "Jobs", headerLargeTitleEnabled: true }} />
      <Stack.Screen
        name="jobs/new"
        // A sheet on iPhone (swipe down or Cancel to close); a full screen on Android.
        options={{ title: "New Job", presentation: ios ? "modal" : "card" }}
      />
      <Stack.Screen name="jobs/[id]/index" options={{ title: "Job" }} />
      <Stack.Screen name="jobs/[id]/component/[componentId]" options={{ title: "Component" }} />
      <Stack.Screen
        name="jobs/[id]/(edit)"
        // Test and Finding: a sheet with its own stack on iPhone (see (edit)/_layout.tsx), so a
        // photo opened from it stays in the sheet; a full-screen push on Android.
        options={{ headerShown: false, presentation: ios ? "modal" : "card" }}
      />
      <Stack.Screen name="jobs/[id]/media/[mediaId]" options={{ title: "Photo" }} />
      <Stack.Screen name="jobs/[id]/signature" options={{ title: "Signature" }} />
      <Stack.Screen name="jobs/[id]/review" options={{ title: "Review and Sign" }} />
      <Stack.Screen name="chemicals" options={{ title: "Chemical Calculator" }} />
      <Stack.Screen
        name="welcome"
        // The first-launch cards (walkthrough, 2026-10-16): a sheet on iPhone.
        options={{ title: "Welcome", presentation: ios ? "modal" : "card" }}
      />
      <Stack.Screen
        name="messages/index"
        options={{ title: "Messages", headerLargeTitleEnabled: true }}
      />
      <Stack.Screen name="messages/[id]" options={{ title: "Conversation" }} />
      <Stack.Screen
        name="messages/new"
        options={{ title: "New Message", presentation: ios ? "modal" : "card" }}
      />
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
