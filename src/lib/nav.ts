export interface NavItem {
  href: string;
  label: string;
  desc: string;
}

export const NAV: NavItem[] = [
  { href: '/', label: 'Home', desc: 'The investigations, at a glance.' },
  { href: '/library', label: 'What Seattle Reads', desc: 'Library checkouts as a cultural seismograph.' },
  { href: '/pets', label: 'Seattle by Pet', desc: 'Pet names, breeds, and a breed map of class.' },
  { href: '/wages', label: 'What Seattle Pays', desc: 'How the city payroll is structured.' },
  { href: '/parking', label: 'The Parking Recovery', desc: 'Where paid parking demand came back, and where it did not.' },
  { href: '/permits', label: 'The Permit Fast Lane', desc: 'Is there a pay-to-play fast lane in permit review? Testing the hypothesis.' },
  { href: '/street-use', label: 'Whose Clock Is It?', desc: 'SDOT street-use permits: is the wait the city, or the applicant?' },
];
