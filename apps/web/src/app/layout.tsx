import type { Metadata } from "next";
import { THEME_SCRIPT } from "@/lib/theme";
import { body, display } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeakBook",
  description: "Inspection reports, repair quotes, and invoicing for pool leak detection shops.",
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
