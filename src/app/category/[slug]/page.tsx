import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CATEGORIES,
  categoryBySlug,
  resolveHref,
  isExternal,
  STATUS_LABEL,
  type Entry,
} from '@/lib/catalog';

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = categoryBySlug(slug);
  return { title: c ? `${c.name} | Seattle in Data` : 'Seattle in Data' };
}

function Datasets({ entry }: { entry: Entry }) {
  if (!entry.datasets.length) return null;
  return (
    <span className="ds-line">
      {entry.datasets.map((d) => (
        <span key={d} className="ds-chip">
          {d}
        </span>
      ))}
    </span>
  );
}

function EntryCard({ entry, accent }: { entry: Entry; accent: string }) {
  const pill = (
    <span className={`status-pill pill-${entry.status}`}>{STATUS_LABEL[entry.status]}</span>
  );

  const inner = (
    <>
      <span className="entry-top">
        {pill}
        {entry.status === 'live' ? <span className="entry-ext">opens the app {'↗'}</span> : null}
      </span>
      <h2 className="entry-title">{entry.title}</h2>
      <p className="entry-blurb">{entry.blurb}</p>
      <Datasets entry={entry} />
    </>
  );

  if (entry.status === 'planned') {
    return (
      <div className="entry-card is-planned" style={{ '--cat': accent } as React.CSSProperties}>
        {inner}
      </div>
    );
  }

  const href = resolveHref(entry);
  // Live apps are separate static apps served at their own paths, so use a plain
  // anchor (full navigation) rather than the Next router.
  if (isExternal(entry)) {
    return (
      <a
        href={href}
        className="entry-card is-link"
        style={{ '--cat': accent } as React.CSSProperties}
        target="_blank"
        rel="noopener noreferrer"
      >
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className="entry-card is-link" style={{ '--cat': accent } as React.CSSProperties}>
      {inner}
    </Link>
  );
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = categoryBySlug(slug);
  if (!category) notFound();

  const idx = CATEGORIES.findIndex((c) => c.slug === category.slug);
  const next = CATEGORIES[(idx + 1) % CATEGORIES.length];

  return (
    <>
      <p className="crumb">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span> {category.name}
      </p>

      <div className="page-head cat-head" style={{ '--cat': category.accent } as React.CSSProperties}>
        <p className="eyebrow cat-eyebrow">{category.tagline}</p>
        <h1>{category.name}</h1>
        <p>{category.intro}</p>
      </div>

      <div className="invest-grid">
        {category.entries.map((e) => (
          <EntryCard key={e.title} entry={e} accent={category.accent} />
        ))}
      </div>

      <div className="cat-next">
        <Link href={`/category/${next.slug}`} className="cat-next-link">
          Next category: <strong>{next.name}</strong> &rarr;
        </Link>
      </div>
    </>
  );
}
