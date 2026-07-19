// A small "Data as of <date>" line. Pass the generatedAt timestamp that every
// generated JSON file already carries. Renders nothing if no date is given.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function DataFreshness({ date }: { date?: string }) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const pretty = `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return (
    <p className="freshness">
      Data as of {pretty}. This site is a periodic snapshot of the city open data, not a live feed.
    </p>
  );
}
