import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';
import { SiteNav } from '@/components/SiteNav';
import { SITE_URL, REPO_URL } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Seattle in Data',
    template: '%s | Seattle in Data',
  },
  description:
    "Maps and charts of Seattle, built from the city's own open data: permits, what the city reads, how it moves, where the money goes, and more.",
  openGraph: {
    siteName: 'Seattle in Data',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
  },
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
            An independent project by Travis Soukup that turns Seattle&apos;s public data into maps and charts. Not
            affiliated with the City of Seattle or the Seattle Public Library. Every chart names its source dataset and
            explains how the numbers were made; the full code and data pipeline are public. Spot an error?{' '}
            <a href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer">
              Report it here
            </a>
            . <Link href="/all">All pages</Link> &middot; <Link href="/about">About</Link> &middot;{' '}
            <Link href="/notes">Data notes</Link> &middot;{' '}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
