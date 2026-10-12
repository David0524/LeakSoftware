import type { Metadata } from "next";
import { body, display } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeakBook",
  description: "Inspection reports, repair quotes, and invoicing for pool leak detection shops.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
