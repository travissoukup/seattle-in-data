import { ImageResponse } from 'next/og';

export const alt = 'Seattle in Data: maps and charts from the city\'s own public records';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Site-wide link-preview card. Simple, readable at thumbnail size.
export default function OgImage() {
  const bars = [86, 150, 118, 210, 168, 250, 140, 190, 232, 120, 200, 260];
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0b3a5c',
          padding: 64,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 84, fontWeight: 700, color: '#ffffff', display: 'flex' }}>
            Seattle{' '}
            <span style={{ color: '#56b4e9', marginLeft: 20 }}>in Data</span>
          </div>
          <div style={{ fontSize: 34, color: '#bcd3e6', marginTop: 18, display: 'flex' }}>
            Maps and charts from the city&apos;s own public records
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, height: 270 }}>
          {bars.map((h, i) => (
            <div
              key={i}
              style={{
                width: 66,
                height: h,
                borderRadius: 8,
                background: i % 3 === 2 ? '#e69f00' : i % 3 === 1 ? '#ffffff' : '#56b4e9',
                display: 'flex',
              }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
