import type { Metadata, Viewport } from "next";
import { tokens } from "@leakbook/tokens";
import { THEME_SCRIPT } from "@/lib/theme";
import { body, display } from "./fonts";
import startupImage from "./splash.json";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tidemark",
  description: "Inspection reports, repair quotes, and invoicing for pool leak detection shops.",
  // Added to an iPhone's Home Screen, the site opens full screen like an app. Its launch images
  // (page color and the mark, light and dark, per screen size) keep it from flashing white;
  // regenerate them with `node brand/scripts/build_splash.mjs`.
  appleWebApp: { capable: true, title: "Tidemark", statusBarStyle: "default", startupImage },
};

// Content runs under the notch and home indicator (pages pad with the safe-area insets), and
// the browser's bars take the page background.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: tokens.color.role.light.bg },
    { media: "(prefers-color-scheme: dark)", color: tokens.color.role.dark.bg },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets data-theme before React loads, hence suppressHydrationWarning.
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
