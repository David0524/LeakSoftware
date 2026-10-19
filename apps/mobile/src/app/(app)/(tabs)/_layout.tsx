import { Tabs } from "expo-router/tabs";
import { TabBarSpace } from "../../../ui/components";
import { TabBar } from "../../../ui/TabBar";
import { color, TAB_BAR_CLEARANCE } from "../../../ui/theme";

export const unstable_settings = { anchor: "(today)" };

/**
 * The website's five tabs, the same for every role (spec 4.1): Today, Jobs, Schedule,
 * Messages, More, each with its own stack, the app opening on Today. The bar is drawn by us
 * on iPhone and Android alike (ui/TabBar.tsx) and floats over the page, so every screen in a
 * tab leaves room under its last row.
 */
export default function TabsLayout() {
  return (
    <TabBarSpace.Provider value={TAB_BAR_CLEARANCE}>
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: color.bg },
        }}
      >
        <Tabs.Screen name="(today)" options={{ title: "Today" }} />
        <Tabs.Screen name="(jobs)" options={{ title: "Jobs" }} />
        <Tabs.Screen name="(schedule)" options={{ title: "Schedule" }} />
        <Tabs.Screen name="(messages)" options={{ title: "Messages" }} />
        <Tabs.Screen name="(more)" options={{ title: "More" }} />
      </Tabs>
    </TabBarSpace.Provider>
  );
}
