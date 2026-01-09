import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'AgileFlow',
  description:
    'AgileFlow turns your repo into an AI-friendly agile system with commands, agents, ADRs, and docs-as-code — built for Claude Code, Cursor, Windsurf, and more.',
  metadataBase: new URL('https://agileflow.dev'),
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: 'AgileFlow',
    description:
      'Agile delivery, in your repo—powered by AI. Scrum + Kanban + ADRs + docs-as-code.',
    type: 'website',
    images: ['/logo.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetBrainsMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
