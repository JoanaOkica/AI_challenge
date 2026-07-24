/**
 * Layer 2 store (PRD §2.4) — attorney work product.
 *
 * Kept in its own namespace, keyed on the content-hash rowId so notes survive
 * re-upload of the same file. Never merged into Layer 1, never exported.
 * Backed by localStorage here; the interface is small enough to swap for
 * IndexedDB or Postgres without touching callers.
 */

import type { WorkProduct } from './types';
import { emptyWorkProduct } from './types';

const NS = 'mcp:workproduct:v1:';

function key(caseId: string): string {
  return NS + caseId;
}

export function loadWorkProduct(caseId: string): WorkProduct {
  if (typeof window === 'undefined') return emptyWorkProduct();
  try {
    const raw = window.localStorage.getItem(key(caseId));
    if (!raw) return emptyWorkProduct();
    const parsed = JSON.parse(raw) as Partial<WorkProduct>;
    return {
      isWorkProduct: true,
      notes: parsed.notes ?? {},
      starred: parsed.starred ?? {},
      suppressed: parsed.suppressed ?? {},
      tZeroRowId: parsed.tZeroRowId,
    };
  } catch {
    return emptyWorkProduct();
  }
}

export function saveWorkProduct(caseId: string, wp: WorkProduct): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key(caseId), JSON.stringify(wp));
  } catch {
    // Quota or private-mode failure: work product simply won't persist.
  }
}

// --- immutable mutators (return a new WorkProduct) ------------------------

export function setNote(wp: WorkProduct, rowId: string, note: string): WorkProduct {
  const notes = { ...wp.notes };
  if (note.trim()) notes[rowId] = note;
  else delete notes[rowId];
  return { ...wp, notes };
}

export function toggleStar(wp: WorkProduct, rowId: string): WorkProduct {
  const starred = { ...wp.starred };
  if (starred[rowId]) delete starred[rowId];
  else starred[rowId] = true;
  return { ...wp, starred };
}

export function toggleSuppress(wp: WorkProduct, rowId: string): WorkProduct {
  const suppressed = { ...wp.suppressed };
  if (suppressed[rowId]) delete suppressed[rowId];
  else suppressed[rowId] = true;
  return { ...wp, suppressed };
}

export function setTZero(wp: WorkProduct, rowId: string | undefined): WorkProduct {
  return { ...wp, tZeroRowId: rowId };
}
