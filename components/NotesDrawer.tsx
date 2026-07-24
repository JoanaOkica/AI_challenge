'use client';

import { useEffect, useState } from 'react';

interface Props {
  open: boolean;
  caseName: string;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}

/**
 * A slide-in case-notes panel. Lives in the app shell (above the page switch),
 * so notes stay put when the lawyer moves between tabs; the value is persisted
 * per case to localStorage by the parent, so they also survive a reload.
 */
export default function NotesDrawer({ open, caseName, value, onChange, onClose }: Props) {
  const [savedFlash, setSavedFlash] = useState(false);

  // brief "saved" confirmation as the lawyer types
  useEffect(() => {
    if (!open) return;
    setSavedFlash(true);
    const t = setTimeout(() => setSavedFlash(false), 900);
    return () => clearTimeout(t);
  }, [value, open]);

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
            <span className={`text-[11px] font-semibold text-emerald-500 transition-opacity ${savedFlash ? 'opacity-100' : 'opacity-0'}`}>
              Saved
            </span>
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

        <div className="border-t border-[#ECECF1] px-5 py-3 text-[11px] text-slate-400">
          Autosaved to this browser, per case. Work product — excluded from every export.
        </div>
      </aside>
    </>
  );
}
