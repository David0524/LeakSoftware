import { TabStack } from "../../../../ui/TabStack";

export const unstable_settings = { anchor: "schedule" };

/** The Schedule tab's stack. */
export default function ScheduleLayout() {
  return <TabStack root="schedule" title="Schedule" />;
}
