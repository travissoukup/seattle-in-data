import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';
import { SiteNav } from '@/components/SiteNav';

export const metadata: Metadata = {
  title: 'Exploring Seattle with Data',
  description:
    "Data-driven investigations into how Seattle actually works, built on the city's open data: what Seattle reads, how its permit system behaves, and more.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              Exploring Seattle <span>with Data</span>
            </Link>
            <SiteNav />
          </div>
        </header>
        <main>
          <div className="container">{children}</div>
        </main>
        <footer className="site-footer">
          <div className="container">
            Independent data investigations built on Seattle&apos;s open data via the Socrata API. Not
            affiliated with the City of Seattle or the Seattle Public Library. Each investigation links its
            sources and methodology.
          </div>
        </footer>
      </body>
    </html>
  );
}
