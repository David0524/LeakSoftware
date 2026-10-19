import { TabStack } from "../../../../ui/TabStack";

export const unstable_settings = { anchor: "messages/index" };

/** The Messages tab's stack. */
export default function MessagesLayout() {
  return <TabStack root="messages/index" title="Messages" />;
}
