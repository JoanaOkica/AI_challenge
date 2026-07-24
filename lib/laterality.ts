/**
 * Laterality refinement (applied at the ingestion boundary, so bodyMap.ts
 * stays verbatim).
 *
 * bodyMap's per-token normalizer falls back to scanning the whole Summary for
 * a side when the token itself carries none (PRD §4). That is correct for a
 * single-part row ("Knee" + "left knee pain" -> left knee), but on a row that
 * lists several parts it smears one stray side word across all of them —
 * labelling the neck or chest "left" because the summary mentioned a left
 * knee. The PRD is explicit that a wrong side is worse than a neutral one, so
 * when a cell yields more than one distinct part we keep only the laterality a
 * token states about itself and drop summary-inferred sides.
 */

import type { NormalizedBodyPart } from './bodyMap';

const TOKEN_SIDE = /bilateral|\bboth\b|\bright\b|\brt\b|\bleft\b|\blt\b|\br\/\b|\bl\/\b/;

export function tokenHasOwnSide(raw: string): boolean {
  return TOKEN_SIDE.test(raw.toLowerCase());
}

export function refineLateralities(parts: NormalizedBodyPart[]): NormalizedBodyPart[] {
  if (parts.length <= 1) return parts;
  // If ANY token stated its own side, a summary side word is ambiguous across
  // the rest — trust only self-stated sides.
  return parts.map((p) => (tokenHasOwnSide(p.raw) ? p : { ...p, laterality: null }));
}
