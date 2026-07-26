'use client';

import { useState } from 'react';
import { setAccessCode } from '@/lib/apiClient';

/**
 * Shown only when the server replies that an access code is required, so an
 * unprotected deployment never sees it.
 */
export default function AccessCodePrompt({
  message,
  onSubmit,
}: {
  message: string;
  onSubmit: () => void;
}) {
  const [code, setCode] = useState('');

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="mb-1 flex items-center gap-2 text-[13px] font-bold text-amber-800">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M7 11V8a5 5 0 0110 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        Access code required
      </div>
      <p className="mb-2.5 text-[12.5px] text-amber-800">{message}</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!code.trim()) return;
          setAccessCode(code.trim());
          setCode('');
          onSubmit();
        }}
      >
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Access code"
          autoComplete="off"
          className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-[13px] font-bold text-white hover:bg-accent-deep"
        >
          Unlock &amp; retry
        </button>
      </form>
    </div>
  );
}
