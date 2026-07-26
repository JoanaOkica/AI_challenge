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
import VerdictHero from './VerdictHero';
import Timeline from './Timeline';
import DetailModal from './DetailModal';
import ReadingPane from './ReadingPane';
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

export default function Portal() {
  const [cases, setCases] = useState<CaseData[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [workProducts, setWorkProducts] = useState<Record<string, WorkProduct>>({});

  const [page, setPage] = useState<AppPage>('dashboard');
  const [attorney, setAttorney] = useState<AttorneyInputs>(EMPTY_ATTORNEY_INPUTS);

  const [notesOpen, setNotesOpen] = useState(false);
  // `caseNote` is the draft in the drawer; `savedNote` is what is on disk. The
  // difference is what makes the save/discard prompt meaningful.
  const [caseNote, setCaseNote] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  const [granularity, setGranularity] = useState<Granularity>('milestones');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [gapDays, setGapDays] = useState(DEFAULT_GAP_DAYS);

  const [selectedNode, setSelectedNode] = useState<TimelineNode | null>(null);
  const [readingRow, setReadingRow] = useState<ResolvedRow | null>(null);
  const [pickingTZero, setPickingTZero] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- dark mode ------------------------------------------------------------
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem('cp:dark');
    if (saved === '1') {
      setDark(true);
      document.documentElement.classList.add('dark');
    }
  }, []);
  const toggleDark = useCallback(() => {
    setDark((v) => {
      const next = !v;
      if (next) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('cp:dark', '1');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.removeItem('cp:dark');
      }
      return next;
    });
  }, []);

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

  const loadSample = useCallback(() => {
    const cd = buildSampleCase();
    addCase(cd);
    // Default the sample's T-Zero to the incident (EMS) so the verdict hero and
    // pre/post comparison populate immediately — matching how a real case reads
    // once the attorney has set the anchor.
    const existing = loadWorkProduct(cd.id);
    if (!existing.tZeroRowId) {
      const ems = cd.rows.find((r) => classify(r.recordType)?.category === 'EMS');
      if (ems) {
        const next = wpSetTZero(existing, ems.rowId);
        saveWorkProduct(cd.id, next);
        setWorkProducts((prev) => ({ ...prev, [cd.id]: next }));
      }
    }
  }, [addCase]);

  const switchCase = useCallback((id: string) => {
    setActiveCaseId(id);
    setFilters(EMPTY_FILTERS);
    setSelectedNode(null);
    setPickingTZero(false);
  }, []);

  /** Never switch away from unsaved notes silently — ask first. */
  const requestSwitch = useCallback(
    (id: string) => {
      if (id === activeCaseId) return;
      if (caseNote !== savedNote) setPendingSwitch(id);
      else switchCase(id);
    },
    [activeCaseId, caseNote, savedNote, switchCase],
  );

  const removeCase = useCallback(
    (id: string) => {
      setCases((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (id === activeCaseId) {
          const fallback = next[next.length - 1] ?? null;
          setActiveCaseId(fallback ? fallback.id : null);
          setFilters(EMPTY_FILTERS);
          setSelectedNode(null);
          setPickingTZero(false);
        }
        return next;
      });
      setPendingRemove(null);
    },
    [activeCaseId],
  );

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

  // Opens a row in the ReadingPane (side panel with PDF); the pane has a
  // "Full detail" button that escalates to the full DetailModal.
  const openReadingPane = useCallback((row: ResolvedRow) => setReadingRow(row), []);

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
      setSavedNote('');
      return;
    }
    let stored = '';
    try {
      stored = localStorage.getItem(NOTES_KEY(activeCaseId)) ?? '';
    } catch {
      stored = '';
    }
    setCaseNote(stored);
    setSavedNote(stored);
  }, [activeCaseId]);

  const notesDirty = caseNote !== savedNote;

  const persistNote = useCallback((id: string, text: string) => {
    try {
      if (text.trim()) localStorage.setItem(NOTES_KEY(id), text);
      else localStorage.removeItem(NOTES_KEY(id));
    } catch {
      /* storage unavailable — the note lives in memory for this session */
    }
  }, []);

  const saveNote = useCallback(() => {
    if (!activeCaseId) return;
    persistNote(activeCaseId, caseNote);
    setSavedNote(caseNote);
  }, [activeCaseId, caseNote, persistNote]);

  /** Throw the draft away and fall back to what was last saved. */
  const discardNote = useCallback(() => setCaseNote(savedNote), [savedNote]);

  // --- landing (no case yet) ------------------------------------------------

  if (!activeCase || !view) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
        <button
          onClick={toggleDark}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="absolute right-5 top-4 rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:bg-slate-50 dark:border-[#2a2d3d] dark:bg-[#1a1d27] dark:text-slate-300"
        >
          {dark ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
        </button>
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
      <header className="sticky top-0 z-40 border-b border-[#E7E8EE] bg-white/90 backdrop-blur dark:border-[#2a2d3d] dark:bg-[#1a1d27]/90">
        <div className="mx-auto flex max-w-[1520px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          {/* Logo + breadcrumb */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-soft shadow-[0_4px_12px_rgba(120,86,255,0.35)]">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                <path d="M3 12h4l2 6 4-14 2 8h6" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-[15px] font-extrabold leading-tight tracking-tight text-ink dark:text-white">
                  Chronology Portal
                </span>
                <span className="text-[12.5px] font-semibold text-slate-500 before:mr-2 before:font-normal before:text-slate-300 before:content-['/']">
                  {activeCase.name}
                </span>
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Demonstrative aids — not evidence
              </div>
            </div>
          </div>

          {/* ── Global search (⌘K) ── */}
          <div className="flex-1" />

          {/* Right controls */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Dark mode toggle */}
            <button
              onClick={toggleDark}
              title={dark ? 'Light mode' : 'Dark mode'}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 dark:border-[#2a2d3d] dark:bg-[#252836] dark:text-slate-400 dark:hover:bg-[#2f3244]"
            >
              {dark ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>

            {cases.length > 1 && (
              <select
                value={activeCase.id}
                onChange={(e) => requestSwitch(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-[#2a2d3d] dark:bg-[#252836] dark:text-slate-300"
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
              onClick={() => setPendingRemove(activeCase.id)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:bg-rose-50 hover:text-rose-600"
              title="Remove this case from the session"
            >
              Remove
            </button>
            <button
              onClick={() => setNotesOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-[#2a2d3d] dark:bg-[#252836] dark:text-slate-300"
              title="Case notes"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M6 3h9l4 4v14H6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M9 12h7M9 16h7M9 8h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              Notes
              {(caseNote.trim() || notesDirty) && (
                <span className={`ml-0.5 h-1.5 w-1.5 rounded-full ${notesDirty ? 'bg-amber-500' : 'bg-accent'}`} />
              )}
            </button>

            <button
              onClick={() => setAddOpen(true)}
              className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2A2E3D] dark:bg-accent dark:hover:bg-accent-deep"
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
            <VerdictHero caseData={activeCase} view={view} />
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
                {pickingTZero && (
                  <div className="flex items-center gap-1">
                    <span className="animate-pulse rounded-full bg-[#F0EEFF] px-2.5 py-1 text-[11px] font-semibold text-accent">
                      Click a node or a record row to set the T-Zero anchor
                    </span>
                  </div>
                )}

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

                {/* The record list belongs under the timeline, not behind a tab. */}
                <DataTable
                  rows={view.tableRows}
                  suppressedRows={view.suppressedRows}
                  onOpenRow={(r) => (pickingTZero ? onSetTZeroRow(r.rowId) : openReadingPane(r))}
                  onToggleSuppress={onToggleSuppress}
                />
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
        dirty={notesDirty}
        onChange={setCaseNote}
        onSave={saveNote}
        onDiscard={discardNote}
        onClose={() => setNotesOpen(false)}
      />

      {/* Unsaved notes must not vanish just because the user changed case. */}
      <Modal
        open={pendingSwitch != null}
        onClose={() => setPendingSwitch(null)}
        title="Save your notes first?"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPendingSwitch(null)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (activeCaseId) persistNote(activeCaseId, savedNote);
                if (pendingSwitch) switchCase(pendingSwitch);
                setPendingSwitch(null);
              }}
              className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
            >
              Discard changes
            </button>
            <button
              onClick={() => {
                if (activeCaseId) persistNote(activeCaseId, caseNote);
                if (pendingSwitch) switchCase(pendingSwitch);
                setPendingSwitch(null);
              }}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-deep"
            >
              Save &amp; switch
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          You have unsaved notes on <span className="font-semibold text-ink">{activeCase.name}</span>. Save them and
          they will be waiting when you come back to this case. Discard and the changes are gone.
        </p>
      </Modal>

      <Modal
        open={pendingRemove != null}
        onClose={() => setPendingRemove(null)}
        title="Remove this case?"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPendingRemove(null)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={() => pendingRemove && removeCase(pendingRemove)}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
            >
              Remove case
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          This closes the case in this session. Your saved notes stay on this browser, keyed to the file&rsquo;s
          content hash — re-upload the same workbook and they come back.
        </p>
      </Modal>

      <ReadingPane
        row={readingRow}
        onClose={() => setReadingRow(null)}
        onOpenDetail={() => {
          if (readingRow) {
            openRow(readingRow);
            setReadingRow(null);
          }
        }}
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
