/**
 * Single front-figure body map for the "story of the injury" timeline.
 *
 * A recognizable humanoid built from labelled zones; the affected zones fill
 * gold (presence, not severity — PRD §4). Back regions (cervical / thoracic /
 * lumbar) are shown as spine stripes on the front figure, so one silhouette
 * carries the whole record without a front/back toggle.
 */

import type { NormalizedBodyPart } from './bodyMap';

export interface FigShape {
  id: string;
  tag: 'path' | 'rect' | 'ellipse';
  attrs: Record<string, string | number>;
  /** Rendered only when the zone is affected (e.g. spine stripes). */
  hotOnly?: boolean;
}

/** Order = paint order. `head` last so it sits on top. */
export const FRONT_SHAPES: FigShape[] = [
  { id: 'chest', tag: 'path', attrs: { d: 'M23,36 Q35,32 47,36 L45,63 L25,63 Z' } },
  { id: 'abdomen', tag: 'path', attrs: { d: 'M25,63 L45,63 L44,90 Q35,96 26,90 Z' } },
  { id: 'neckF', tag: 'rect', attrs: { x: 30, y: 30.5, width: 10, height: 7.5, rx: 2.5 } },
  { id: 'armR', tag: 'path', attrs: { d: 'M23,38 Q14,43 13,62 L12,86 Q12,90 16,89 L18,64 Q19,49 25,45 Z' } },
  { id: 'armL', tag: 'path', attrs: { d: 'M47,38 Q56,43 57,62 L58,86 Q58,90 54,89 L52,64 Q51,49 45,45 Z' } },
  { id: 'handR', tag: 'ellipse', attrs: { cx: 14, cy: 92, rx: 4, ry: 5 } },
  { id: 'handL', tag: 'ellipse', attrs: { cx: 56, cy: 92, rx: 4, ry: 5 } },
  { id: 'pelvis', tag: 'path', attrs: { d: 'M26,90 L44,90 L43,103 Q35,107 27,103 Z' } },
  { id: 'thighR', tag: 'path', attrs: { d: 'M27,103 L34,103 L33,150 L27,150 Z' } },
  { id: 'thighL', tag: 'path', attrs: { d: 'M36,103 L43,103 L43,150 L37,150 Z' } },
  { id: 'kneeR', tag: 'rect', attrs: { x: 26.5, y: 150, width: 7.5, height: 11, rx: 3 } },
  { id: 'kneeL', tag: 'rect', attrs: { x: 36, y: 150, width: 7.5, height: 11, rx: 3 } },
  { id: 'shinR', tag: 'path', attrs: { d: 'M27,161 L34,161 L33,200 L28,200 Z' } },
  { id: 'shinL', tag: 'path', attrs: { d: 'M36,161 L43,161 L42,200 L37,200 Z' } },
  { id: 'footR', tag: 'path', attrs: { d: 'M27,200 L34,200 L35,208 L25,208 Z' } },
  { id: 'footL', tag: 'path', attrs: { d: 'M36,200 L43,200 L45,208 L35,208 Z' } },
  { id: 'spineUpF', tag: 'rect', attrs: { x: 33.2, y: 38, width: 3.6, height: 26, rx: 1.8 }, hotOnly: true },
  { id: 'spineLoF', tag: 'rect', attrs: { x: 33.2, y: 62, width: 3.6, height: 36, rx: 1.8 }, hotOnly: true },
  { id: 'head', tag: 'ellipse', attrs: { cx: 35, cy: 19, rx: 11, ry: 14 } },
];

/** Map one normalized body part to the front-figure zone ids it lights up. */
export function frontZones(p: NormalizedBodyPart): string[] {
  const out: string[] = [];
  const side = p.laterality;
  const L = side === 'left' || side === 'bilateral' || side == null;
  const R = side === 'right' || side === 'bilateral' || side == null;
  const lr = (base: string) => {
    if (L) out.push(base + 'L');
    if (R) out.push(base + 'R');
  };
  const { id, region } = p;

  if (region === 'HEAD' || region === 'MIND') out.push('head');
  else if (region === 'NECK') out.push('neckF', 'spineUpF');
  else if (id === 'spine_thoracic') out.push('spineUpF');
  else if (id === 'spine_lumbar' || id === 'spine_general') out.push('spineLoF');
  else if (id === 'buttocks') out.push('pelvis');
  else if (id === 'chest' || id === 'chest_systemic' || id === 'chest_lungs') out.push('chest');
  else if (id === 'abdomen') out.push('abdomen');
  else if (region === 'SYSTEMIC') out.push('chest', 'abdomen');
  else if (region === 'TORSO') out.push('chest', 'spineLoF');
  else if (id === 'shoulder') lr('arm');
  else if (id === 'wrist' || id === 'hand') lr('hand');
  else if (region === 'UPPER_EXT') lr('arm');
  else if (id === 'hip_pelvis') out.push('pelvis');
  else if (id === 'knee') lr('knee');
  else if (id === 'ankle' || id === 'foot') lr('foot');
  else if (id === 'leg_lower' || id === 'lower_extremity') lr('shin');
  else if (id === 'thigh') lr('thigh');
  else if (region === 'LOWER_EXT') lr('thigh');
  return out;
}

/** Union of front-figure zones for a whole node. */
export function nodeZones(parts: NormalizedBodyPart[]): Set<string> {
  const s = new Set<string>();
  for (const p of parts) for (const z of frontZones(p)) s.add(z);
  return s;
}
