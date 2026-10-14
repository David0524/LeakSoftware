import type { NativeStackNavigationOptions } from "expo-router/native-stack";
import { Platform } from "react-native";
import { color, font, header, ios } from "./theme";

/**
 * iOS 26 and later draw the bar in Liquid Glass with a scroll edge effect on their own; adding
 * a blur there doubles the effect (react-native-screens warns about it), so it is for older iOS.
 */
const liquidGlass = ios && Number.parseInt(String(Platform.Version), 10) >= 26;

/**
 * iPhone: a translucent, frosted navigation bar (the system's chrome material) that the page
 * scrolls under, as in iOS apps. Scrolling screens inset their content below it on their own
 * (Screen sets contentInsetAdjustmentBehavior). Android keeps its solid navy app bar.
 */
export const translucentBar: NativeStackNavigationOptions = ios
  ? {
      headerTransparent: true,
      headerBlurEffect: liquidGlass ? undefined : "systemChromeMaterial",
      headerStyle: { backgroundColor: "transparent" },
    }
  : { headerTransparent: false, headerStyle: { backgroundColor: header.background } };

/** A solid bar for screens that don't scroll (the markup editor), so nothing sits under it. */
export const solidBar: NativeStackNavigationOptions = {
  headerTransparent: false,
  headerBlurEffect: undefined,
  headerStyle: { backgroundColor: header.background },
};

/**
 * The app's stack navigators (the main one and the iPhone sheets): iOS bar on iPhone with large
 * titles where a screen turns them on and the back button named after the previous screen;
 * Android's navy bar with the arrow back.
 */
export const stackScreenOptions: NativeStackNavigationOptions = {
  ...translucentBar,
  headerTintColor: header.tint,
  headerTitleStyle: { fontFamily: font.displayBold, fontSize: 20, color: header.title },
  headerLargeTitleStyle: { fontFamily: font.displayExtraBold, color: header.title },
  // Before scrolling, the large title sits on the page's own gray, as in iOS Settings.
  headerLargeStyle: { backgroundColor: header.background },
  headerLargeTitleShadowVisible: false,
  headerBackButtonDisplayMode: ios ? "default" : "minimal",
  contentStyle: { backgroundColor: color.bg },
};
