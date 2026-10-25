import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { tokens } from "@leakbook/tokens";
import { THEME_SCRIPT } from "@/lib/theme";
import { DiscardGuard } from "@/components/discard-guard";
import { STARTUP_IMAGES, rootMetadata } from "@/lib/root-metadata";
import { body, display } from "./fonts";
import "./globals.css";
import { PhoneFormatting } from "@/components/phone-format";

export const metadata: Metadata = rootMetadata;

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
        {/* The Home Screen launch images, here rather than in metadata (lib/root-metadata). */}
        {STARTUP_IMAGES.map((s) => (
          <link key={s.url} rel="apple-touch-startup-image" href={s.url} media={s.media} />
        ))}
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        {/* Unsaved page forms ask before a link, Back, or reload leaves them. */}
        <Suspense fallback={null}>
          <DiscardGuard />
        </Suspense>
        <PhoneFormatting />
      </body>
    </html>
  );
}
