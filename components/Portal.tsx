'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CaseData, Granularity, ResolvedRow, WorkProduct, NodeCategory } from '@/lib/types';
import { emptyWorkProduct, REGION_LABELS } from '@/lib/types';
import type { Region } from '@/lib/bodyMap';
import { EMPTY_FILTERS, resolveView, type Filters, type TimelineNode } from '@/lib/resolve';
import { classify } from '@/lib/milestones';
import { ingestWorkbook } from '@/lib/ingest';
import { buildSampleCase } from '@/lib/sampleData';
import { DEFAULT_GAP_DAYS } from '@/lib/gaps';
import {
  loadWorkProduct,
  saveWorkProduct,
  setNote as wpSetNote,
  toggleStar as wpToggleStar,
  toggleSuppress as wpToggleSuppress,
  setTZero as wpSetTZero,
} from '@/lib/workProduct';

import Header from './Header';
import Timeline from './Timeline';
import DetailModal from './DetailModal';
import SidePanel from './SidePanel';
import DataTable from './DataTable';
import UploadDropzone from './UploadDropzone';
import Modal from './Modal';

type ViewTab = 'timeline' | 'table';

export default function Portal() {
  const [cases, setCases] = useState<CaseData[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [workProducts, setWorkProducts] = useState<Record<string, WorkProduct>>({});

  const [granularity, setGranularity] = useState<Granularity>('milestones');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [gapDays, setGapDays] = useState(DEFAULT_GAP_DAYS);
  const [viewTab, setViewTab] = useState<ViewTab>('timeline');

  const [selectedNode, setSelectedNode] = useState<TimelineNode | null>(null);
  const [pickingTZero, setPickingTZero] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCase = useMemo(() => cases.find((c) => c.id === activeCaseId) ?? null, [cases, activeCaseId]);
  const wp = (activeCaseId && workProducts[activeCaseId]) || emptyWorkProduct();

  // --- case management ------------------------------------------------------

  const addCase = useCallback((cd: CaseData) => {
    setCases((prev) => {
      const without = prev.filter((c) => c.id !== cd.id);
      return [...without, cd];
    });
    setWorkProducts((prev) => ({ ...prev, [cd.id]: loadWorkProduct(cd.id) }));
    setActiveCaseId(cd.id);
    setFilters(EMPTY_FILTERS);
    setSelectedNode(null);
    setPickingTZero(false);
    setError(null);
    setAddOpen(false);
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      setBusy(true);
      setError(null);
      try {
        let last: CaseData | null = null;
        for (const file of files) {
          const buf = await file.arrayBuffer();
          const cd = ingestWorkbook(buf, file.name);
          if (cd.rows.length === 0) {
            setError(`${file.name}: ${cd.warnings[0] ?? 'no rows found.'}`);
          }
          last = cd;
          // add each case (dedupe by id) but only activate the last
          setCases((prev) => [...prev.filter((c) => c.id !== cd.id), cd]);
          setWorkProducts((prev) => ({ ...prev, [cd.id]: loadWorkProduct(cd.id) }));
        }
        if (last) {
          setActiveCaseId(last.id);
          setFilters(EMPTY_FILTERS);
          setSelectedNode(null);
          setPickingTZero(false);
          if (last.rows.length > 0) setAddOpen(false);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to read the workbook.');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const loadSample = useCallback(() => addCase(buildSampleCase()), [addCase]);

  const switchCase = useCallback((id: string) => {
    setActiveCaseId(id);
    setFilters(EMPTY_FILTERS);
    setSelectedNode(null);
    setPickingTZero(false);
  }, []);

  // --- work-product mutations ----------------------------------------------

  const mutateWp = useCallback(
    (fn: (wp: WorkProduct) => WorkProduct) => {
      if (!activeCaseId) return;
      setWorkProducts((prev) => {
        const current = prev[activeCaseId] ?? emptyWorkProduct();
        const next = fn(current);
        saveWorkProduct(activeCaseId, next);
        return { ...prev, [activeCaseId]: next };
      });
    },
    [activeCaseId],
  );

  const onNote = useCallback((rowId: string, text: string) => mutateWp((w) => wpSetNote(w, rowId, text)), [mutateWp]);
  const onToggleStar = useCallback((rowId: string) => mutateWp((w) => wpToggleStar(w, rowId)), [mutateWp]);
  const onToggleSuppress = useCallback((rowId: string) => mutateWp((w) => wpToggleSuppress(w, rowId)), [mutateWp]);
  const onSetTZeroRow = useCallback(
    (rowId: string) => {
      mutateWp((w) => wpSetTZero(w, w.tZeroRowId === rowId ? undefined : rowId));
      setPickingTZero(false);
    },
    [mutateWp],
  );
  const onClearTZero = useCallback(() => mutateWp((w) => wpSetTZero(w, undefined)), [mutateWp]);

  // --- derived view ---------------------------------------------------------

  const view = useMemo(
    () => (activeCase ? resolveView(activeCase, wp, granularity, filters, gapDays) : null),
    [activeCase, wp, granularity, filters, gapDays],
  );

  // keep the open modal's node in sync after mutations (notes/stars/suppress)
  useEffect(() => {
    if (!selectedNode || !view) return;
    const fresh = view.nodes.find((n) => n.key === selectedNode.key);
    if (fresh && fresh !== selectedNode) setSelectedNode(fresh);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const regionsPresent = useMemo<Region[]>(() => {
    if (!activeCase) return [];
    const set = new Set<Region>();
    for (const row of activeCase.rows) for (const r of row.regions) set.add(r);
    return (Object.keys(REGION_LABELS) as Region[]).filter((r) => set.has(r));
  }, [activeCase]);

  /** Wrap a single row into a node so the detail modal can show it. */
  const openRow = useCallback((row: ResolvedRow) => {
    const cat = classify(row.recordType);
    const category: NodeCategory = cat ? cat.category : 'ENCOUNTER';
    setSelectedNode({
      key: `row-${row.rowId}`,
      date: row.encounterDate ?? new Date(NaN),
      category,
      rows: [row],
      parts: row.bodyParts,
      regions: row.regions,
      isTZero: !!row.isTZero,
    });
  }, []);

  const onPickTZeroNode = useCallback(
    (node: TimelineNode) => {
      // anchor on the earliest row of the node that has a date
      const row = [...node.rows].sort((a, b) => +(a.encounterDate ?? 0) - +(b.encounterDate ?? 0))[0];
      if (row) onSetTZeroRow(row.rowId);
    },
    [onSetTZeroRow],
  );

  // --- render ---------------------------------------------------------------

  if (!activeCase || !view) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Medical Chronology &amp; Body Timeline</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            Turn a records chronology into a milestone timeline, a body map, and a pre/post-incident causation
            comparison. Demonstrative aids — not evidence.
          </p>
        </div>
        <UploadDropzone onFiles={handleFiles} onSample={loadSample} busy={busy} error={error} />
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Header
        cases={cases}
        activeCase={activeCase}
        onSwitchCase={switchCase}
        onAddClick={() => setAddOpen(true)}
        granularity={granularity}
        onGranularity={setGranularity}
        filters={filters}
        onFilters={setFilters}
        regionsPresent={regionsPresent}
        tZeroRow={view.tZeroRow}
        pickingTZero={pickingTZero}
        onTogglePickTZero={() => setPickingTZero((v) => !v)}
        onClearTZero={onClearTZero}
      />

      {activeCase.warnings.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-800">
          {activeCase.warnings.join(' · ')}
        </div>
      )}

      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* view tabs */}
          <div className="flex items-center gap-1">
            {(['timeline', 'table'] as ViewTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setViewTab(t)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                  viewTab === t ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-white/60'
                }`}
              >
                {t}
              </button>
            ))}
            {pickingTZero && (
              <span className="ml-2 animate-pulse rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                Click a {viewTab === 'timeline' ? 'node' : 'row'} to set the T-Zero anchor
              </span>
            )}
          </div>

          {viewTab === 'timeline' ? (
            <Timeline
              nodes={view.nodes}
              gaps={view.gaps}
              dateExtent={view.dateExtent}
              tZeroDate={view.tZeroDate}
              gapDays={gapDays}
              onGapDays={setGapDays}
              onSelectNode={setSelectedNode}
              pickingTZero={pickingTZero}
              onPickTZero={onPickTZeroNode}
            />
          ) : (
            <DataTable
              rows={view.tableRows}
              suppressedRows={view.suppressedRows}
              onOpenRow={(r) => (pickingTZero ? onSetTZeroRow(r.rowId) : openRow(r))}
              onToggleSuppress={onToggleSuppress}
            />
          )}
        </div>

        <SidePanel
          caseData={activeCase}
          allRows={view.allRows}
          comparison={view.comparison}
          tZeroDate={view.tZeroDate}
          unassignedNoDate={view.unassignedNoDate}
          unassignedNoBody={view.unassignedNoBody}
          onOpenRow={openRow}
          onPickTZeroPrompt={() => setPickingTZero(true)}
        />
      </div>

      <DetailModal
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        onNote={onNote}
        onToggleStar={onToggleStar}
        onToggleSuppress={onToggleSuppress}
        onSetTZero={onSetTZeroRow}
      />

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add a case" widthClass="max-w-xl">
        <UploadDropzone onFiles={handleFiles} onSample={loadSample} busy={busy} error={error} compact />
        <p className="mt-3 text-center text-[11px] text-slate-400">
          Each workbook becomes its own workspace. Notes are stored per case, keyed to a content hash so they survive
          re-upload of the same file.
        </p>
      </Modal>

      <footer className="border-t border-slate-200 px-4 py-3 text-center text-[11px] text-slate-400">
        Demonstrative aids generated from produced records — not evidence. Every element traces to a source row in one
        click. Attorney notes are work product and are excluded from exports.
      </footer>
    </main>
  );
}
