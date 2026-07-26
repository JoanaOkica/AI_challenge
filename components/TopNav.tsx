'use client';

export type AppPage = 'dashboard' | 'heatmap' | 'builder' | 'simulator' | 'presentation';

interface Tab {
  id: AppPage;
  label: string;
  icon: React.ReactNode;
}

/** Names say what you get out of each module, not what it is internally. */
const TABS: Tab[] = [
  {
    id: 'dashboard',
    label: 'Case Overview',
    icon: <path d="M4 19V9m5 10V5m5 14v-7m5 7V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  },
  {
    id: 'heatmap',
    label: 'Body Map',
    icon: (
      <path
        d="M12 3a2.2 2.2 0 100 4.4A2.2 2.2 0 0012 3zM8 9h8l-1.4 6H13l.6 6h-3.2l.6-6H9.4z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill="none"
      />
    ),
  },
  {
    id: 'builder',
    label: 'Demand Letter',
    icon: (
      <path
        d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill="none"
      />
    ),
  },
  {
    id: 'simulator',
    label: 'Defense Playbook',
    icon: (
      <path
        d="M12 3l7 3v6c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill="none"
      />
    ),
  },
  {
    id: 'presentation',
    label: 'Jury Slides',
    icon: (
      <path
        d="M3 4h18v11H3zM12 15v4m-4 0h8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill="none"
      />
    ),
  },
];

export default function TopNav({ page, onPage }: { page: AppPage; onPage: (p: AppPage) => void }) {
  return (
    <div className="mx-auto max-w-[1520px] px-4 pb-3 sm:px-6">
      <nav className="flex flex-wrap items-center gap-1 rounded-2xl bg-[#171A2E] p-1.5">
        {TABS.map((t) => {
          const active = page === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onPage(t.id)}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-bold transition ${
                active
                  ? 'bg-accent text-white shadow-[0_2px_10px_rgba(120,86,255,0.45)]'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                {t.icon}
              </svg>
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
