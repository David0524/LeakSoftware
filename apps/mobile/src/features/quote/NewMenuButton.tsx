import { router } from "expo-router";
import { HeaderButton } from "../../ui/components";
import { chooseAction } from "../../ui/confirm";

/** New Job's + choices, in order (docs/design/2026-11-24-standalone-quotes.md, Entry points). */
export const NEW_MENU = [
  { label: "New Job", path: "/jobs/new" },
  { label: "New Quote", path: "/quotes/new" },
] as const;

/**
 * The + where New Job was, on Today, Jobs and Schedule: an action sheet with New Job and New
 * Quote, as on the mobile website. Shown to the same people as New Job (canMakeJobs).
 */
export function NewMenuButton() {
  return (
    <HeaderButton
      title="New Job or Quote"
      icon="add"
      onPress={() =>
        chooseAction({
          actions: NEW_MENU.map((item) => ({
            label: item.label,
            onPress: () => router.push(item.path),
          })),
        })
      }
    />
  );
}
