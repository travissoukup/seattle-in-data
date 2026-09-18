import Link from 'next/link';
import { PropertyExplorer } from './PropertyExplorer';
import './property.css';

// The landing page is indexable (it's just the search box + how-it-works).
// Individual addresses live behind ?p=&z= query params — client-rendered and
// unlinked — so no per-address report becomes its own search-engine page.
export const metadata = {
  title: 'Look up a Seattle property',
  description:
    'Type any Seattle address and see what the public records say: the building, its value and sales, what the zoning would let you build, permit history, and the red flags a buyer should know.',
};

export default function PropertyPage() {
  return (
    <>
      <p className="crumb no-print">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span> Property lookup
      </p>

      <div className="page-head no-print">
        <p className="eyebrow">Property lookup</p>
        <h1>Look up any Seattle property</h1>
        <p>
          Type an address to pull together what the public records say about it: the building and lot, its assessed
          value and sale history, what the zoning would let you build, every permit ever filed, and the red flags a
          buyer or owner should check. All from public data, none of it advice.
        </p>
      </div>

      <PropertyExplorer />
    </>
  );
}
