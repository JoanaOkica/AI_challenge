'use client';

import { useRef, useState } from 'react';

interface UploadDropzoneProps {
  onFiles: (files: File[]) => void;
  onSample: () => void;
  busy?: boolean;
  error?: string | null;
  compact?: boolean;
}

export default function UploadDropzone({ onFiles, onSample, busy, error, compact }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  };

  return (
    <div className={compact ? '' : 'mx-auto max-w-xl'}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 text-center transition ${
          compact ? 'py-8' : 'py-14'
        } ${dragging ? 'border-accent bg-indigo-50' : 'border-slate-300 bg-white hover:border-accent hover:bg-slate-50'}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" className="mb-2 text-slate-400">
          <path d="M12 16V4m0 0l-4 4m4-4l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <div className="text-sm font-semibold text-slate-700">
          {busy ? 'Reading workbook…' : 'Drop a chronology workbook, or click to browse'}
        </div>
        <div className="mt-1 text-xs text-slate-400">
          Excel (.xlsx). Encounter Date · Provider · Facility · Body Parts · Record Type · Summary · Link To Pdf
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
      )}

      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500">
        <span>No file handy?</span>
        <button
          onClick={onSample}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
        >
          Load sample case
        </button>
      </div>
    </div>
  );
}
