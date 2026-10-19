import { TabStack } from "../../../../ui/TabStack";

export const unstable_settings = { anchor: "jobs/index" };

/** The Jobs tab's stack. */
export default function JobsLayout() {
  return <TabStack root="jobs/index" title="Jobs" />;
}
