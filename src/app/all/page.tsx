import Link from 'next/link';
import { CATEGORIES, resolveHref, isExternal, type Entry } from '@/lib/catalog';

export const metadata = { title: 'All pages' };

function Card({ e }: { e: Entry }) {
  const href = resolveHref(e);
  const ext = isExternal(e);
  const inner = (
    <>
      <div className="related-title">
        {e.title} {ext ? <span className="esc">live tool</span> : null}
      </div>
      <div className="related-blurb">{e.blurb}</div>
    </>
  );
  return ext ? (
    <a href={href} className="related-card" target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  ) : (
    <Link href={href} className="related-card">
      {inner}
    </Link>
  );
}

export default function AllPage() {
  const total = CATEGORIES.reduce((s, c) => s + c.entries.length, 0);
  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span> All pages
      </p>
      <div className="page-head">
        <p className="eyebrow">Index</p>
        <h1>Everything on the site</h1>
        <p>
          Every map, chart, tool, and story, grouped by topic. {total} in all. New to the site? Start with{' '}
          <Link href="/about">how this was made</Link>.
        </p>
      </div>

      {CATEGORIES.map((c) => (
        <div key={c.slug} style={{ marginBottom: 26 }}>
          <h2 className="home-section-h" style={{ marginTop: 8, color: c.accent }}>
            {c.name}
          </h2>
          <div className="related-grid">
            {c.entries.map((e) => (
              <Card key={e.title} e={e} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
