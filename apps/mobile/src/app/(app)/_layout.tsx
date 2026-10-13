import { Stack } from "expo-router";
import { color, font } from "../../ui/theme";

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: color.header },
        headerTintColor: color.onHeader,
        headerTitleStyle: { fontFamily: font.displayBold, fontSize: 20 },
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: color.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Jobs" }} />
      <Stack.Screen name="jobs/new" options={{ title: "New Job" }} />
      <Stack.Screen name="jobs/[id]/index" options={{ title: "Job" }} />
      <Stack.Screen name="jobs/[id]/component/[componentId]" options={{ title: "Component" }} />
      <Stack.Screen name="jobs/[id]/test/[testId]" options={{ title: "Test" }} />
      <Stack.Screen name="jobs/[id]/finding/[findingId]" options={{ title: "Finding" }} />
      <Stack.Screen name="jobs/[id]/media/[mediaId]" options={{ title: "Photo" }} />
      <Stack.Screen name="jobs/[id]/signature" options={{ title: "Signature" }} />
      <Stack.Screen name="jobs/[id]/review" options={{ title: "Review and Sign" }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
      <Stack.Screen name="reauth" options={{ title: "Sign In Again", presentation: "modal" }} />
    </Stack>
  );
}
