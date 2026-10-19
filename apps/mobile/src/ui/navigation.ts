import type { NativeStackNavigationOptions } from "expo-router/native-stack";
import { createElement } from "react";
import { Platform } from "react-native";
import { DrawnHeader } from "./Bar";
import { color, face, font, ios } from "./theme";

// The navigation bar on every screen (spec 3.1, 8.2). iPhone: the native bar with large titles
// in Barlow, translucent so the page scrolls under it. Android and the browser preview: the
// website's bar drawn by us (ui/Bar.tsx) with the large title in the page.

/**
 * iOS 26 and later draw the bar in Liquid Glass with a scroll edge effect on their own; adding
 * a blur there doubles the effect (react-native-screens warns about it), so it is for older iOS.
 */
const liquidGlass = ios && Number.parseInt(String(Platform.Version), 10) >= 26;

/** A translucent bar the page scrolls under. */
export const translucentBar: NativeStackNavigationOptions = ios
  ? {
      headerTransparent: true,
      headerBlurEffect: liquidGlass ? undefined : "systemChromeMaterial",
      headerStyle: { backgroundColor: "transparent" },
    }
  : // Drawn bar: solid by default; a screen with a large title (Screen's `title`) turns it
    // transparent so the page shows through until it scrolls under.
    { headerTransparent: false };

/** A solid bar for screens that don't scroll (the markup editor), so nothing sits under it. */
export const solidBar: NativeStackNavigationOptions = ios
  ? {
      headerTransparent: false,
      headerBlurEffect: undefined,
      headerStyle: { backgroundColor: color.bg },
    }
  : { headerTransparent: false };

/** Read when a navigator renders, so the bar follows Appearance. */
export function stackScreenOptions(): NativeStackNavigationOptions {
  if (!ios)
    return {
      ...translucentBar,
      header: (props) => createElement(DrawnHeader, props),
      contentStyle: { backgroundColor: color.bg },
      // Android keeps its own system back gesture and button (spec 8.3).
      animation: Platform.OS === "web" ? "none" : "default",
    };
  return {
    ...translucentBar,
    headerTintColor: color.link,
    headerTitleStyle: { ...face.semiBold, fontSize: 17, color: color.text },
    headerLargeTitleEnabled: true,
    headerLargeTitleStyle: { fontFamily: font.displayExtraBold, fontSize: 34, color: color.text },
    // Before scrolling, the large title sits on the page's own gray, as on the website.
    headerLargeStyle: { backgroundColor: color.bg },
    headerLargeTitleShadowVisible: false,
    headerShadowVisible: false,
    headerBackButtonDisplayMode: "default",
    contentStyle: { backgroundColor: color.bg },
  };
}
