import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { QUICK_START_HABITS } from '../lib/habitLibrary';
import type { LibraryHabit } from '../lib/habitLibrary';

interface Props {
  onHabitAdded: () => void;
  onAddCustom: () => void;
}

export function GetStarted({ onHabitAdded, onAddCustom }: Props) {
  const [addingName, setAddingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addStarter(habit: LibraryHabit) {
    setError(null);
    setAddingName(habit.name);
    const { error } = await supabase.from('habits').insert({
      name: habit.name,
      color: habit.color,
      schedule: habit.schedule ?? 'daily',
      target_type: habit.target_type ?? 'boolean',
      target_value: habit.target_value ?? null,
      target_unit: habit.target_unit ?? null,
    });
    setAddingName(null);
    if (error) {
      setError(error.message);
      return;
    }
    onHabitAdded();
  }

  return (
    <div className="screen">
      <h1>Get started</h1>
      <p className="subtitle">Tap a habit to add it, or build your own.</p>

      {error && <p className="error">{error}</p>}

      <div className="chip-grid">
        {QUICK_START_HABITS.map((h) => (
          <button
            key={h.name}
            type="button"
            className="chip"
            style={{ borderColor: h.color }}
            disabled={addingName !== null}
            onClick={() => addStarter(h)}
          >
            <span className="chip-dot" style={{ background: h.color }} />
            {addingName === h.name ? 'Adding…' : h.name}
          </button>
        ))}
      </div>

      <button type="button" className="btn-link" onClick={onAddCustom}>
        + Add your own habit
      </button>
    </div>
  );
}
