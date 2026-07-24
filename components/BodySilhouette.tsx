'use client';

import type { NormalizedBodyPart, Region } from '@/lib/bodyMap';

/**
 * Front-facing silhouette with flat, fixed-opacity region fills keyed to
 * PRESENCE — never inferred severity (PRD §4). Laterality is honoured on the
 * limbs; when the side is unknown the limb is hatched rather than guessed
 * (a wrong knee in front of a mediator is worse than a neutral one).
 *
 * Orientation: the figure faces the viewer, so the patient's right limb is
 * drawn on the viewer's left. The R / L ticks make that explicit.
 */

const FILL = 'rgba(99, 102, 241, 0.6)';
const BASE = '#e6e9ef';
const STROKE_ACTIVE = '#6366f1';
const STROKE_BASE = '#c3cad6';

interface LimbState {
  left: boolean;
  right: boolean;
  unknown: boolean;
}

function limbState(parts: NormalizedBodyPart[], region: Region): LimbState {
  let left = false;
  let right = false;
  let unknown = false;
  for (const p of parts) {
    if (p.region !== region) continue;
    if (p.laterality === 'left') left = true;
    else if (p.laterality === 'right') right = true;
    else if (p.laterality === 'bilateral') {
      left = true;
      right = true;
    } else unknown = true;
  }
  return { left, right, unknown };
}

type ShapeFill = 'solid' | 'hatch' | 'none';

function limbFill(active: LimbState, side: 'left' | 'right'): ShapeFill {
  const specific = side === 'left' ? active.left : active.right;
  if (specific) return 'solid';
  // Region involved but no side at all -> hatch both (side unspecified).
  if (active.unknown && !active.left && !active.right) return 'hatch';
  return 'none';
}

function shapeProps(fill: ShapeFill) {
  if (fill === 'solid') return { fill: FILL, stroke: STROKE_ACTIVE, strokeWidth: 1.5 };
  if (fill === 'hatch') return { fill: 'url(#hatch)', stroke: STROKE_ACTIVE, strokeWidth: 1.5 };
  return { fill: BASE, stroke: STROKE_BASE, strokeWidth: 1 };
}

export interface BodySilhouetteProps {
  parts: NormalizedBodyPart[];
  /** Rendered width in px; height is ~2.1x. */
  size?: number;
  showSideTicks?: boolean;
  className?: string;
}

export default function BodySilhouette({
  parts,
  size = 120,
  showSideTicks = false,
  className,
}: BodySilhouetteProps) {
  const active = (r: Region) => parts.some((p) => p.region === r);
  const head = active('HEAD');
  const mind = active('MIND');
  const neck = active('NECK');
  const torso = active('TORSO');
  const systemic = active('SYSTEMIC');
  const arms = limbState(parts, 'UPPER_EXT');
  const legs = limbState(parts, 'LOWER_EXT');

  const uid = 'body';
  const height = Math.round(size * 2.1);

  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 200 420"
      className={className}
      role="img"
      aria-label="Body regions affected"
    >
      <defs>
        <pattern id="hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill={BASE} />
          <line x1="0" y1="0" x2="0" y2="6" stroke={FILL} strokeWidth="2.5" />
        </pattern>
      </defs>

      {/* Legs (drawn first, behind torso hem) */}
      <path
        id={`${uid}-svg-thigh-L`}
        d="M82,208 C78,214 77,250 79,300 L82,404 C82,414 95,414 95,404 L98,300 C99,252 100,222 99,210 Z"
        {...shapeProps(limbFill(legs, 'right'))}
      />
      <path
        id={`${uid}-svg-thigh-R`}
        d="M118,208 C122,214 123,250 121,300 L118,404 C118,414 105,414 105,404 L102,300 C101,252 100,222 101,210 Z"
        {...shapeProps(limbFill(legs, 'left'))}
      />

      {/* Arms */}
      <path
        id={`${uid}-svg-arm-L`}
        d="M62,90 C52,94 47,112 45,132 L41,196 C40,205 51,206 52,197 L57,134 C59,120 63,104 68,98 Z"
        {...shapeProps(limbFill(arms, 'right'))}
      />
      <path
        id={`${uid}-svg-arm-R`}
        d="M138,90 C148,94 153,112 155,132 L159,196 C160,205 149,206 148,197 L143,134 C141,120 137,104 132,98 Z"
        {...shapeProps(limbFill(arms, 'left'))}
      />

      {/* Neck */}
      <rect x="88" y="62" width="24" height="22" rx="5" {...shapeProps(neck ? 'solid' : 'none')} />

      {/* Torso */}
      <path
        id={`${uid}-svg-torso`}
        d="M62,86 C82,78 118,78 138,86 L132,150 C131,178 126,200 118,208 L82,208 C74,200 69,178 68,150 Z"
        {...shapeProps(torso ? 'solid' : 'none')}
      />

      {/* Systemic indicator (heart/lungs/abdomen don't map to one spot) */}
      {systemic && (
        <g>
          <circle cx="100" cy="122" r="11" fill={FILL} stroke={STROKE_ACTIVE} strokeWidth="1.5" />
          <path d="M100,117 v10 M95,122 h10" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}

      {/* Head */}
      <ellipse cx="100" cy="40" rx="25" ry="30" {...shapeProps(head ? 'solid' : 'none')} />

      {/* Mind marker (psych) — inner dot, distinct from structural head */}
      {mind && <circle cx="100" cy="38" r="8" fill="#7c3aed" stroke="#fff" strokeWidth="1.5" />}

      {showSideTicks && (
        <g fontSize="11" fill="#64748b" fontWeight={600}>
          <text x="30" y="92" textAnchor="middle">
            R
          </text>
          <text x="170" y="92" textAnchor="middle">
            L
          </text>
        </g>
      )}
    </svg>
  );
}
