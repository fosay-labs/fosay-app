import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'FOSAY — Funds Only Spent After Yes',
  description: 'A wallet you share with your AI agent. You approve what it spends.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { themeColor: '#0b0d10', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <Link href="/" aria-label="FOSAY home">
            <strong>FOSAY</strong>
          </Link>
          <nav>
            <Link href="/dashboard">Wallet</Link>
            <Link href="/approvals">Approvals</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
