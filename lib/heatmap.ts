/**
 * Injury heatmap — maps normalized body parts onto a stylized figure's zones
 * and buckets treatment intensity (encounter count per zone) into flag levels.
 * A proxy for where care concentrated, not a clinical judgment.
 */

import type { NormalizedBodyPart } from './bodyMap';

export type Zone =
  | 'head'
  | 'neck'
  | 'chest'
  | 'abdomen'
  | 'upperBack'
  | 'lowerBack'
  | 'armL'
  | 'armR'
  | 'handL'
  | 'handR'
  | 'thighL'
  | 'thighR'
  | 'legL'
  | 'legR'
  | 'footL'
  | 'footR';

export const ZONE_LABELS: Record<Zone, string> = {
  head: 'Head',
  neck: 'Neck',
  chest: 'Chest',
  abdomen: 'Abdomen',
  upperBack: 'Upper Back',
  lowerBack: 'Lower Back',
  armL: 'Left Arm',
  armR: 'Right Arm',
  handL: 'Left Hand',
  handR: 'Right Hand',
  thighL: 'Left Hip',
  thighR: 'Right Hip',
  legL: 'Left Leg',
  legR: 'Right Leg',
  footL: 'Left Foot',
  footR: 'Right Foot',
};

export const ALL_ZONES = Object.keys(ZONE_LABELS) as Zone[];

function sides(part: NormalizedBodyPart): ('L' | 'R')[] {
  if (part.laterality === 'left') return ['L'];
  if (part.laterality === 'right') return ['R'];
  return ['L', 'R']; // bilateral or unstated -> both
}

/** Which figure zones a normalized part contributes to. */
export function partToZones(part: NormalizedBodyPart): Zone[] {
  const s = sides(part);
  switch (part.id) {
    case 'head_brain':
    case 'mind_psych':
    case 'face_eye':
    case 'face_ear':
    case 'face_nose':
    case 'face_mouth':
    case 'head':
      return ['head'];
    case 'neck_cervical':
      return ['neck'];
    case 'chest':
    case 'chest_lungs':
    case 'chest_systemic':
      return ['chest'];
    case 'abdomen':
      return ['abdomen'];
    case 'spine_thoracic':
    case 'spine_general':
      return ['upperBack'];
    case 'spine_lumbar':
    case 'buttocks':
      return ['lowerBack'];
    case 'shoulder':
    case 'elbow':
    case 'forearm':
    case 'arm_upper':
    case 'upper_extremity':
      return s.map((x) => (x === 'L' ? 'armL' : 'armR'));
    case 'wrist':
    case 'hand':
      return s.map((x) => (x === 'L' ? 'handL' : 'handR'));
    case 'hip_pelvis':
    case 'thigh':
      return s.map((x) => (x === 'L' ? 'thighL' : 'thighR'));
    case 'knee':
    case 'leg_lower':
    case 'lower_extremity':
      return s.map((x) => (x === 'L' ? 'legL' : 'legR'));
    case 'ankle':
    case 'foot':
      return s.map((x) => (x === 'L' ? 'footL' : 'footR'));
    default:
      return []; // systemic_other, skin, musculoskeletal_other -> no figure zone
  }
}

export type FlagLevel = 'none' | 'low' | 'medium' | 'high';

export const FLAG_COLOR: Record<FlagLevel, string> = {
  none: '#E4E1F1',
  low: '#F2AFA6',
  medium: '#E1584F',
  high: '#D8332B',
};

export const FLAG_LEGEND: { level: FlagLevel; label: string }[] = [
  { level: 'none', label: 'No flag' },
  { level: 'low', label: 'Low' },
  { level: 'medium', label: 'Medium' },
  { level: 'high', label: 'High' },
];

/** Encounter-count buckets. */
export function bucket(count: number): FlagLevel {
  if (count <= 0) return 'none';
  if (count === 1) return 'low';
  if (count <= 3) return 'medium';
  return 'high';
}
