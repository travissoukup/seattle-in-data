'use client';

interface Props {
  filename: string;
  csv: string;
  label?: string;
}

/** Downloads a CSV string the page built at render time. Client-only (Blob). */
export function CsvButton({ filename, csv, label = 'Download CSV' }: Props) {
  const onClick = (): void => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  return (
    <button className="csv-btn" type="button" onClick={onClick}>
      {label}
    </button>
  );
}
