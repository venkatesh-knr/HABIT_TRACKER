import { LIBRARY_CATEGORIES, HABIT_LIBRARY } from '../lib/habitLibrary';
import type { LibraryHabit } from '../lib/habitLibrary';

interface Props {
  onPick: (habit: LibraryHabit) => void;
  onBack: () => void;
}

export function HabitLibrary({ onPick, onBack }: Props) {
  return (
    <div className="screen">
      <header className="top-bar">
        <button type="button" className="btn-link" onClick={onBack}>
          ← Back
        </button>
        <h1>Habit library</h1>
      </header>

      <p className="subtitle">Tap one to set it up with your own schedule and goal.</p>

      {LIBRARY_CATEGORIES.map((category) => (
        <section key={category} className="library-category">
          <h2>{category}</h2>
          <div className="chip-grid">
            {HABIT_LIBRARY.filter((h) => h.category === category).map((h) => (
              <button key={h.name} type="button" className="chip" style={{ borderColor: h.color }} onClick={() => onPick(h)}>
                <span className="chip-dot" style={{ background: h.color }} />
                {h.name}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
