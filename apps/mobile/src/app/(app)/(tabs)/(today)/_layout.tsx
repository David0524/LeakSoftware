import { TabStack } from "../../../../ui/TabStack";

export const unstable_settings = { anchor: "index" };

/** The Today tab's stack. */
export default function TodayLayout() {
  return <TabStack root="index" title="Today" />;
}
