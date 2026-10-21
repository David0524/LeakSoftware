import { Stack } from "expo-router";
import { stackScreenOptions } from "./navigation";
import { BrandHeaderLeft } from "./SundeckLogo";

/**
 * One tab's navigation stack (spec 4.1, 4.4): its root screen, then the screens any tab can
 * push (the job page, New Job, a checklist item, a conversation, Chemical),
 * which live once in (tabs)/(today,jobs,schedule,messages,more) so pushing a job from Today
 * keeps the Today tab. The tab bar stays on all of them. The root screen has the logo at the
 * left of its bar (owner, 2026-10-21); the pushed screens have Back there.
 */
export function TabStack({ root, title }: { root: string; title: string }) {
  return (
    <Stack screenOptions={stackScreenOptions()}>
      <Stack.Screen name={root} options={{ title, headerLeft: BrandHeaderLeft }} />
      <Stack.Screen name="jobs/[id]/index" options={{ title: "Job" }} />
      <Stack.Screen name="jobs/[id]/component/[componentId]" options={{ title: "Item" }} />
      <Stack.Screen name="jobs/new" options={{ title: "New Job" }} />
      <Stack.Screen name="messages/[id]" options={{ title: "Conversation" }} />
      <Stack.Screen name="messages/new" options={{ title: "New Message" }} />
      <Stack.Screen name="chemicals" options={{ title: "Chemical" }} />
    </Stack>
  );
}
