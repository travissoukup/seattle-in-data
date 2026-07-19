import { CATEGORIES } from './catalog';

export interface NavItem {
  href: string;
  label: string;
  desc: string;
}

export const NAV: NavItem[] = [
  { href: '/', label: 'Home', desc: 'Browse by topic.' },
  ...CATEGORIES.map((c) => ({
    href: `/category/${c.slug}`,
    label: c.name,
    desc: c.tagline,
  })),
  { href: '/about', label: 'About', desc: 'How this was made.' },
];
