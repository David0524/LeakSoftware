import { Stack } from "expo-router";
import { stackScreenOptions } from "../../../../../ui/navigation";
import { SheetProvider } from "../../../../../ui/sheet";

/**
 * Add/Edit Test and Add/Edit Finding. On iPhone this stack is a sheet (presented from
 * (app)/_layout), with its own navigation so a photo opened from it pushes inside the sheet
 * instead of behind it. On Android it is an ordinary full-screen push.
 */
export default function EditSheetLayout() {
  return (
    <SheetProvider>
      <Stack screenOptions={stackScreenOptions}>
        <Stack.Screen name="test/[testId]" options={{ title: "Test" }} />
        <Stack.Screen name="finding/[findingId]" options={{ title: "Finding" }} />
        <Stack.Screen name="capture/[mediaId]" options={{ title: "Photo" }} />
      </Stack>
    </SheetProvider>
  );
}
