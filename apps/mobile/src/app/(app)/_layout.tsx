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
      <Stack.Screen name="jobs/new" options={{ title: "New job" }} />
      <Stack.Screen name="jobs/[id]" options={{ title: "Job" }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
      <Stack.Screen name="reauth" options={{ title: "Sign in again", presentation: "modal" }} />
    </Stack>
  );
}
