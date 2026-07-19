import Link from 'next/link';
import { CATEGORIES, HERO, STORIES, APPS, resolveHref, isExternal } from '@/lib/catalog';
import { fmtInt } from '@/lib/format';
import building from '@/lib/generated/building-map.json';
import crime from '@/lib/generated/crime.json';
import force from '@/lib/generated/force.json';
import library from '@/lib/generated/library.json';

export const metadata = {
  title: 'Seattle in Data',
  description: HERO.tagline,
};

export default function HomePage() {
  const total = CATEGORIES.reduce((s, c) => s + c.entries.length, 0);
  const featured = [...APPS, ...STORIES];

  // Four verified findings, every number computed from the generated data.
  const findings = [
    {
      href: '/building-map',
      kicker: 'Housing',
      num: `-${building.units.dropPct}%`,
      accent: '#d55e00',
      text: `New homes permitted since the ${building.units.peakY} peak: ${fmtInt(building.units.peakN)} units then, ${fmtInt(building.units.lastN)} last year.`,
    },
    {
      href: '/crime',
      kicker: 'Safety',
      num: fmtInt(crime.lowest.reports),
      accent: '#0072b2',
      text: `Police reports in ${crime.lowest.y}, the ${crime.lowIsLatest ? 'lowest' : 'quietest'} full year since at least ${crime.seriesStartYear}.`,
    },
    {
      href: '/force',
      kicker: 'Police',
      num: `-${force.declinePct}%`,
      accent: '#009e73',
      text: `Use-of-force reports since the ${force.peakYear} peak: ${fmtInt(force.peakCount)} then, ${fmtInt(force.latestYearCount)} in ${force.latestFullYear}.`,
    },
    {
      href: '/library',
      kicker: 'Library',
      num: fmtInt(library.stats.recordCheckouts),
      accent: '#cc79a7',
      text: `Library checkouts in ${library.stats.recordYear}, an all-time record one year after ransomware took the catalog down.`,
    },
  ];

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Public records, turned into maps and charts</p>
        <h1>{HERO.title}</h1>
        <p>{HERO.intro}</p>
      </div>

      <div className="findings">
        {findings.map((f) => (
          <Link key={f.href} href={f.href} className="finding-card" style={{ borderTopColor: f.accent }}>
            <div className="finding-kicker">{f.kicker}</div>
            <div className="finding-num">{f.num}</div>
            <div className="finding-text">{f.text}</div>
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

      <h2 className="home-section-h">Browse by topic</h2>
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

      <p className="muted" style={{ marginTop: 26, fontSize: 13 }}>
        {total} maps and pages so far, plus the tools and stories above. Each one is built from public data and links
        to the source so you can check it yourself. See <Link href="/all">the full list</Link>, read{' '}
        <Link href="/notes">the data notes</Link>, or see <Link href="/about">how this was made</Link>.
      </p>
    </>
  );
}
