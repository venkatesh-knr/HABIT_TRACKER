import type { ReactElement } from 'react';

export type Tab = 'today' | 'calendar' | 'stats' | 'habits' | 'profile';

interface Props {
  active: Tab;
  onSelect: (tab: Tab) => void;
}

const ICONS: Record<Tab, ReactElement> = {
  today: (
    <path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  stats: (
    <path d="M4 20V13M9.3 20V8M14.7 20v-6M20 20V4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
  ),
  habits: (
    <path d="M4 6.5h16M4 12h16M4 17.5h11" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  ),
  profile: (
    <>
      <circle cx="12" cy="8.5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.8 20a7.4 7.4 0 0114.4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'stats', label: 'Stats' },
  { id: 'habits', label: 'Habits' },
  { id: 'profile', label: 'Profile' },
];

export function NavBar({ active, onSelect }: Props) {
  return (
    <nav className="nav-bar">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`nav-tab ${active === t.id ? 'selected' : ''}`}
          onClick={() => onSelect(t.id)}
          aria-current={active === t.id ? 'page' : undefined}
        >
          <svg className="nav-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
            {ICONS[t.id]}
          </svg>
          <span className="nav-tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
