import { Stack } from "expo-router";
import { stackScreenOptions } from "./navigation";

/**
 * One tab's navigation stack (spec 4.1, 4.4): its root screen, then the screens any tab can
 * push (the job page, New Job, a checklist item, a conversation, the Chemical Calculator),
 * which live once in (tabs)/(today,jobs,schedule,messages,more) so pushing a job from Today
 * keeps the Today tab. The tab bar stays on all of them.
 */
export function TabStack({ root, title }: { root: string; title: string }) {
  return (
    <Stack screenOptions={stackScreenOptions()}>
      <Stack.Screen name={root} options={{ title }} />
      <Stack.Screen name="jobs/[id]/index" options={{ title: "Job" }} />
      <Stack.Screen name="jobs/[id]/component/[componentId]" options={{ title: "Item" }} />
      <Stack.Screen name="jobs/new" options={{ title: "New Job" }} />
      <Stack.Screen name="messages/[id]" options={{ title: "Conversation" }} />
      <Stack.Screen name="messages/new" options={{ title: "New Message" }} />
      <Stack.Screen name="chemicals" options={{ title: "Chemical Calculator" }} />
    </Stack>
  );
}
