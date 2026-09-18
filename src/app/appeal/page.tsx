import Link from 'next/link';
import { AppealBuilder } from './AppealBuilder';
import '../property/property.css';
import './appeal.css';

export const metadata = {
  title: 'Build a property tax appeal',
  description:
    'Type a Seattle address and get a complete, free property tax appeal packet: comparable sales from the assessor\'s own records, an opinion of value, the grounds that apply to your property, and how to file.',
};

export default function AppealPage() {
  return (
    <>
      <p className="crumb no-print">
        <Link href="/">Seattle in Data</Link> <span className="crumb-sep">/</span> Tax appeal builder
      </p>

      <div className="page-head no-print">
        <p className="eyebrow">Property tax</p>
        <h1>Build a property tax appeal, free</h1>
        <p>
          Filing an appeal with the King County Board of Equalization costs nothing, and in recent years around a
          fifth of decided appeals produced a reduction. The work is in assembling comparable sales and stating a
          defensible opinion of value. Type an address and this does that part from the assessor&rsquo;s own data.
        </p>
      </div>

      <AppealBuilder />
    </>
  );
}
