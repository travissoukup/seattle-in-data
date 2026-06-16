export interface NavItem {
  href: string;
  label: string;
  desc: string;
}

export const NAV: NavItem[] = [
  { href: '/', label: 'Home', desc: 'The investigations, at a glance.' },
  { href: '/library', label: 'What Seattle Reads', desc: 'Library checkouts as a cultural seismograph.' },
  { href: '/permits', label: 'The Permit Fast Lane', desc: 'Is there a pay-to-play fast lane in permit review? Testing the hypothesis.' },
];
