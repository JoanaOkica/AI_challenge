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
import { EMPTY_ATTORNEY_INPUTS, type AttorneyInputs } from '@/lib/ai';
import {
  loadWorkProduct,
  saveWorkProduct,
  setNote as wpSetNote,
  toggleStar as wpToggleStar,
  toggleSuppress as wpToggleSuppress,
  setTZero as wpSetTZero,
} from '@/lib/workProduct';

import TopNav, { type AppPage } from './TopNav';
import Header from './Header';
import Timeline from './Timeline';
import DetailModal from './DetailModal';
import SidePanel from './SidePanel';
import DataTable from './DataTable';
import UploadDropzone from './UploadDropzone';
import Modal from './Modal';
import CaseBuilder from './CaseBuilder';
import DefenseSimulator from './DefenseSimulator';
import CourtPresentation from './CourtPresentation';
import InjuryHeatmap from './InjuryHeatmap';
import NotesDrawer from './NotesDrawer';

const NOTES_KEY = (id: string) => `cp:casenotes:${id}`;

/**
 * Security: the bundled SheetJS build carries a known ReDoS advisory whose
 * blast radius scales with input size, so refuse oversized or wrong-typed
 * files before the parser ever sees them.
 */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_EXT = /\.(xlsx|xlsm|xls)$/i;

type ViewTab = 'timeline' | 'table';

export default function Portal() {
  const [cases, setCases] = useState<CaseData[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [workProducts, setWorkProducts] = useState<Record<string, WorkProduct>>({});

  const [page, setPage] = useState<AppPage>('dashboard');
  const [attorney, setAttorney] = useState<AttorneyInputs>(EMPTY_ATTORNEY_INPUTS);

  const [notesOpen, setNotesOpen] = useState(false);
  const [caseNote, setCaseNote] = useState('');

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
    setCases((prev) => [...prev.filter((c) => c.id !== cd.id), cd]);
    setWorkProducts((prev) => ({ ...prev, [cd.id]: loadWorkProduct(cd.id) }));
    setActiveCaseId(cd.id);
    setFilters(EMPTY_FILTERS);
    setSelectedNode(null);
    setPickingTZero(false);
    setError(null);
    setAddOpen(false);
  }, []);

  const handleFiles = useCallback(async (files: File[]) => {
    setBusy(true);
    setError(null);
    try {
      let last: CaseData | null = null;
      for (const file of files) {
        if (!ALLOWED_EXT.test(file.name)) {
          setError(`${file.name}: not a spreadsheet (.xlsx, .xlsm or .xls).`);
          continue;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          setError(
            `${file.name}: file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
          );
          continue;
        }
        const buf = await file.arrayBuffer();
        const cd = ingestWorkbook(buf, file.name);
        if (cd.rows.length === 0) setError(`${file.name}: ${cd.warnings[0] ?? 'no rows found.'}`);
        last = cd;
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
  }, []);

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
      const row = [...node.rows].sort((a, b) => +(a.encounterDate ?? 0) - +(b.encounterDate ?? 0))[0];
      if (row) onSetTZeroRow(row.rowId);
    },
    [onSetTZeroRow],
  );

  // --- case notes (persist per case, survive page switches + reload) --------

  useEffect(() => {
    if (!activeCaseId) {
      setCaseNote('');
      return;
    }
    try {
      setCaseNote(localStorage.getItem(NOTES_KEY(activeCaseId)) ?? '');
    } catch {
      setCaseNote('');
    }
  }, [activeCaseId]);

  const onCaseNote = useCallback(
    (v: string) => {
      setCaseNote(v);
      if (!activeCaseId) return;
      try {
        localStorage.setItem(NOTES_KEY(activeCaseId), v);
      } catch {
        /* storage unavailable — note lives in memory for the session */
      }
    },
    [activeCaseId],
  );

  // --- landing (no case yet) ------------------------------------------------

  if (!activeCase || !view) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-soft shadow-[0_4px_12px_rgba(120,86,255,0.35)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M3 12h4l2 6 4-14 2 8h6" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Chronology Portal</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            A demand-letter machine with a visual cockpit. Drop a records chronology to unlock the injury dashboard,
            case builder, defense simulator, and court presentation.
          </p>
        </div>
        <UploadDropzone onFiles={handleFiles} onSample={loadSample} busy={busy} error={error} />
      </main>
    );
  }

  // --- shell ----------------------------------------------------------------

  return (
    <div className="flex min-h-screen flex-col">
      {/* brand bar */}
      <header className="sticky top-0 z-40 border-b border-[#E7E8EE] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1520px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-soft shadow-[0_4px_12px_rgba(120,86,255,0.35)]">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                <path d="M3 12h4l2 6 4-14 2 8h6" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <div className="text-[15px] font-extrabold leading-tight tracking-tight">Chronology Portal</div>
              <div className="text-[10.5px] font-semibold tracking-wide text-slate-400">
                {activeCase.name}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {cases.length > 1 && (
              <select
                value={activeCase.id}
                onChange={(e) => switchCase(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                title="Switch case"
              >
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.stats.encounterCount})
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => setNotesOpen(true)}
              className="relative inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              title="Case notes"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M6 3h9l4 4v14H6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M9 12h7M9 16h7M9 8h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              Notes
              {caseNote.trim() && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-accent" />}
            </button>
            <button
              onClick={() => setAddOpen(true)}
              className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2A2E3D]"
            >
              + Add case
            </button>
          </div>
        </div>
        <TopNav page={page} onPage={setPage} />
      </header>

      {activeCase.warnings.length > 0 && page === 'dashboard' && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-[11px] text-amber-800">
          {activeCase.warnings.join(' · ')}
        </div>
      )}

      <main className="mx-auto w-full max-w-[1520px] flex-1 px-4 py-5 sm:px-6">
        {page === 'dashboard' && (
          <div className="mxfade flex flex-col gap-4">
            <Header
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

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="flex min-w-0 flex-col gap-4">
                <div className="flex items-center gap-1">
                  {(['timeline', 'table'] as ViewTab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setViewTab(t)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                        viewTab === t ? 'bg-white text-ink shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-white/60'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                  {pickingTZero && (
                    <span className="ml-2 animate-pulse rounded-full bg-[#F0EEFF] px-2.5 py-1 text-[11px] font-semibold text-accent">
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
          </div>
        )}

        {page === 'heatmap' && <InjuryHeatmap caseData={activeCase} view={view} />}
        {page === 'builder' && <CaseBuilder view={view} attorney={attorney} onAttorney={setAttorney} />}
        {page === 'simulator' && <DefenseSimulator view={view} />}
        {page === 'presentation' && (
          <CourtPresentation caseData={activeCase} view={view} attorney={attorney} />
        )}
      </main>

      <NotesDrawer
        open={notesOpen}
        caseName={activeCase.name}
        value={caseNote}
        onChange={onCaseNote}
        onClose={() => setNotesOpen(false)}
      />

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

      <footer className="border-t border-[#E7E8EE] bg-white px-4 py-3 text-center">
        <span className="text-[11.5px] font-semibold tracking-wide text-slate-400">
          DEMONSTRATIVE AID ONLY — every element traces to a produced source record. Attorney notes are work product and
          excluded from exports.
        </span>
      </footer>
    </div>
  );
}
