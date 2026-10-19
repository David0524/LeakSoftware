import { TabStack } from "../../../../ui/TabStack";

export const unstable_settings = { anchor: "more/index" };

/** The More tab's stack. */
export default function MoreLayout() {
  return <TabStack root="more/index" title="More" />;
}
