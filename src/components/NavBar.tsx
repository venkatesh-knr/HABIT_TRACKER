export type Tab = 'today' | 'calendar' | 'stats' | 'habits';

interface Props {
  active: Tab;
  onSelect: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: '✓' },
  { id: 'calendar', label: 'Calendar', icon: '▦' },
  { id: 'stats', label: 'Stats', icon: '▲' },
  { id: 'habits', label: 'Habits', icon: '☰' },
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
        >
          <span className="nav-tab-icon">{t.icon}</span>
          <span className="nav-tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
