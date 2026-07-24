'use client';

export type AppPage = 'dashboard' | 'builder' | 'simulator' | 'presentation';

interface Tab {
  id: AppPage;
  n: number;
  label: string;
}

const TABS: Tab[] = [
  { id: 'dashboard', n: 1, label: 'Injury Dashboard' },
  { id: 'builder', n: 2, label: 'Case Builder' },
  { id: 'simulator', n: 3, label: 'Defense Simulator' },
  { id: 'presentation', n: 4, label: 'Court Presentation' },
];

export default function TopNav({
  page,
  onPage,
}: {
  page: AppPage;
  onPage: (p: AppPage) => void;
}) {
  return (
    <nav className="bg-[#0E1030]">
      <div className="mx-auto flex max-w-[1520px] flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6">
        {TABS.map((t) => {
          const active = page === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onPage(t.id)}
              aria-current={active ? 'page' : undefined}
              className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold transition sm:px-4 ${
                active
                  ? 'bg-accent text-white shadow-[0_2px_10px_rgba(120,86,255,0.5)]'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <span className={active ? 'text-white/80' : 'text-slate-500'}>{t.n}.</span>{' '}
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
