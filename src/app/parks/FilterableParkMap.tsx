'use client';

import { useMemo, useState } from 'react';
import { PointMap } from '@/components/PointMap';

interface Park {
  lat: number;
  lng: number;
  name: string;
  addr: string;
  features: string[];
}

interface Props {
  parks: Park[];
  /** Feature types in display order, with park counts, e.g. { key: 'Restrooms', n: 89 }. */
  featureOptions: { key: string; n: number }[];
  color: string;
}

/** The parks dot map with a feature filter: pick "Restrooms" to see only parks that list one. */
export function FilterableParkMap({ parks, featureOptions, color }: Props) {
  const [feature, setFeature] = useState('');

  const points = useMemo(() => {
    const kept = feature ? parks.filter((p) => p.features.includes(feature)) : parks;
    return kept.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      color,
      label: `<strong>${p.name}</strong><br/>${p.addr}${
        p.features.length ? `<br/><em>${p.features.join(', ')}</em>` : ''
      }`,
    }));
  }, [parks, feature, color]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <label htmlFor="park-feature" style={{ fontSize: 14 }}>
          Show parks with
        </label>
        <select
          id="park-feature"
          value={feature}
          onChange={(e) => setFeature(e.target.value)}
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--card, #fff)',
            color: 'inherit',
            fontSize: 14,
          }}
        >
          <option value="">any feature (all parks)</option>
          {featureOptions.map((f) => (
            <option key={f.key} value={f.key}>
              {f.key} ({f.n})
            </option>
          ))}
        </select>
        <span style={{ fontSize: 13, color: 'var(--muted, #667)' }}>
          {points.length} park{points.length === 1 ? '' : 's'} shown
        </span>
      </div>
      <PointMap points={points} height={520} radius={4} legend={[{ label: 'Park', color }]} />
    </div>
  );
}
