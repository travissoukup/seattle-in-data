import Link from 'next/link';
import { CATEGORIES, HERO, STORIES, APPS, resolveHref, isExternal } from '@/lib/catalog';

export const metadata = {
  title: 'Seattle in Data',
  description: HERO.tagline,
};

export default function HomePage() {
  const total = CATEGORIES.reduce((s, c) => s + c.entries.length, 0);
  const featured = [...APPS, ...STORIES];

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Public records, turned into maps and charts</p>
        <h1>{HERO.title}</h1>
        <p>{HERO.intro}</p>
      </div>

      <div className="hub-grid">
        {CATEGORIES.map((c) => (
          <Link
            key={c.slug}
            href={`/category/${c.slug}`}
            className="cat-tile"
            style={{ '--cat': c.accent } as React.CSSProperties}
          >
            <span className="cat-kicker">{c.tagline}</span>
            <h2 className="cat-name">{c.name}</h2>
            <p className="cat-intro">{c.intro}</p>
            <span className="cat-meta">
              {c.entries.length} pages
              <span className="cat-go">Open &rarr;</span>
            </span>
          </Link>
        ))}
      </div>

      <h2 className="home-section-h">Tools and reads</h2>
      <p className="home-section-sub">
        The interactive tools and the longer stories, the parts of the site most worth your time.
      </p>
      <div className="related-grid">
        {featured.map((e) => {
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
            <a key={e.title} href={href} className="related-card" target="_blank" rel="noopener noreferrer">
              {inner}
            </a>
          ) : (
            <Link key={e.title} href={href} className="related-card">
              {inner}
            </Link>
          );
        })}
      </div>

      <p className="muted" style={{ marginTop: 26, fontSize: 13 }}>
        {total} maps and pages so far, plus the tools and stories above. Each one is built from public data and links
        to the source so you can check it yourself. See <Link href="/all">the full list</Link> or{' '}
        <Link href="/about">how this was made</Link>.
      </p>
    </>
  );
}
