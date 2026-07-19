import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';
import { SiteNav } from '@/components/SiteNav';

export const metadata: Metadata = {
  title: 'Seattle in Data',
  description:
    "Maps and charts of Seattle, built from the city's own open data: permits, what the city reads, how it moves, where the money goes, and more.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              Seattle <span>in Data</span>
            </Link>
            <SiteNav />
          </div>
        </header>
        <main>
          <div className="container">{children}</div>
        </main>
        <footer className="site-footer">
          <div className="container">
            An independent project that turns Seattle&apos;s public data into maps and charts. Not affiliated with
            the City of Seattle or the Seattle Public Library. Every page links to its source data and explains how
            the numbers were made. <Link href="/all">All pages</Link> &middot; <Link href="/about">About</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
