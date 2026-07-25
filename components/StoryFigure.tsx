'use client';

import { createElement } from 'react';
import type { NormalizedBodyPart } from '@/lib/bodyMap';
import { FRONT_SHAPES, nodeZones } from '@/lib/bodyZones';

/**
 * The single front silhouette used on timeline story cards and the detail
 * modal. Affected zones fill gold; back regions surface as spine stripes.
 */
export default function StoryFigure({
  parts,
  size = 106,
  className,
}: {
  parts: NormalizedBodyPart[];
  size?: number;
  className?: string;
}) {
  const hot = nodeZones(parts);
  const width = Math.round(size * 0.33);

  return (
    <svg
      width={width}
      height={size}
      viewBox="0 0 70 216"
      className={className}
      role="img"
      aria-label="Body regions affected"
    >
      {FRONT_SHAPES.map((s) => {
        const isHot = hot.has(s.id);
        if (s.hotOnly && !isHot) return null;
        return createElement(s.tag, {
          key: s.id,
          ...s.attrs,
          fill: isHot ? '#f2b104' : '#c9cedb',
          stroke: isHot ? '#c28e04' : '#b3bac9',
          strokeWidth: 0.6,
        });
      })}
    </svg>
  );
}
