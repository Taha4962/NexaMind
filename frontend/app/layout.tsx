/**
 * NexaMind Frontend — Root Layout
 *
 * Top-level layout that wraps the entire application with:
 * - QueryClientProvider for TanStack Query
 * - Global font loading (Inter + JetBrains Mono)
 * - HTML metadata and SEO tags
 * - Global CSS styles
 */

import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/constants";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

/** Global SEO metadata */
export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  keywords: [
    "AI assistant",
    "RAG",
    "knowledge graph",
    "personal AI",
    "document chat",
    "memory AI",
  ],
  authors: [{ name: "NexaMind" }],
  openGraph: {
    title: APP_NAME,
    description: APP_DESCRIPTION,
    type: "website",
  },
};

/**
 * Root layout component.
 *
 * Provides the HTML structure, font classes, and global providers
 * to all pages in the application.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans min-h-screen`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
