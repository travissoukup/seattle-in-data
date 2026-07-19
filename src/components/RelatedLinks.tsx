import Link from 'next/link';
import { RELATED } from '@/lib/related';
import { entryByHref, resolveHref, isExternal } from '@/lib/catalog';

// A "keep exploring" block at the foot of a page. Pass the page's own route as
// slug; it renders the hand-picked related pages from related.ts.
export function RelatedLinks({ slug }: { slug: string }) {
  const targets = RELATED[slug] ?? [];
  const entries = targets.map((t) => entryByHref(t)).filter((e): e is NonNullable<typeof e> => !!e);
  if (!entries.length) return null;
  return (
    <div className="related">
      <h2 className="related-h">Keep exploring</h2>
      <div className="related-grid">
        {entries.map((e) => {
          const href = resolveHref(e);
          const ext = isExternal(e);
          const inner = (
            <>
              <div className="related-title">{e.title}</div>
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
    </div>
  );
}
