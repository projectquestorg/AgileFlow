import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "AgileFlow - Portable workflows for coding agents",
  description:
    "AgileFlow is a portable skill manager, compatibility layer, and evaluation system for coding agents. Install a skill once and use it with Codex, Claude, Cursor, OpenCode, and Gemini. Small, versioned workflows. No agent runtime. No repository takeover.",
  metadataBase: new URL("https://agileflow.dev"),
  icons: {
    icon: "/banner.png",
    shortcut: "/banner.png",
    apple: "/banner.png",
  },
  openGraph: {
    title: "AgileFlow - Portable workflows for coding agents",
    description:
      "Install a skill once. Use it with Codex, Claude, Cursor, OpenCode, Gemini, and the tools built on top of them.",
    type: "website",
    images: ["/banner.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetBrainsMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
