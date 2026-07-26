'use client';

import { useEffect, useState } from 'react';

interface Props {
  open: boolean;
  caseName: string;
  value: string;
  /** True when the draft differs from what is stored for this case. */
  dirty: boolean;
  onChange: (v: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  onClose: () => void;
}

/**
 * A slide-in case-notes panel. Lives in the app shell (above the page switch),
 * so notes stay put when the lawyer moves between tabs. Saving is explicit:
 * the parent keeps a draft and only writes to storage on Save, which is what
 * makes the "save before switching case?" prompt meaningful.
 */
export default function NotesDrawer({
  open,
  caseName,
  value,
  dirty,
  onChange,
  onSave,
  onDiscard,
  onClose,
}: Props) {
  const [savedFlash, setSavedFlash] = useState(false);

  // Confirm a write briefly, so Save visibly does something.
  useEffect(() => {
    if (dirty) setSavedFlash(false);
  }, [dirty]);

  const save = () => {
    onSave();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/20 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-[420px] flex-col bg-white shadow-2xl transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-[#ECECF1] px-5 py-4">
          <div>
            <div className="text-sm font-extrabold">Case notes</div>
            <div className="text-[11px] font-semibold text-slate-400">{caseName}</div>
          </div>
          <div className="flex items-center gap-3">
            {dirty ? (
              <span className="text-[11px] font-semibold text-amber-600">Unsaved changes</span>
            ) : (
              <span
                className={`text-[11px] font-semibold text-emerald-500 transition-opacity ${
                  savedFlash ? 'opacity-100' : 'opacity-0'
                }`}
              >
                Saved
              </span>
            )}
            <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close notes">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Strategy, to-dos, adjuster calls, settlement posture… These notes are private work product, kept per case and never included in exports."
          className="flex-1 resize-none px-5 py-4 text-[14px] leading-relaxed text-ink placeholder:text-slate-400 focus:outline-none"
        />

        <div className="flex items-center justify-between gap-3 border-t border-[#ECECF1] px-5 py-3">
          <span className="text-[11px] text-slate-400">
            Saved to this browser, per case. Work product — excluded from every export.
          </span>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={onDiscard}
              disabled={!dirty}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Discard
            </button>
            <button
              onClick={save}
              disabled={!dirty}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-deep disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
