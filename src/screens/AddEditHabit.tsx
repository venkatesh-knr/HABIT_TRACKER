import { useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import type { Habit, Schedule } from '../types';

interface Props {
  habit: Habit | null;
  onDone: () => void;
  onCancel: () => void;
}

const COLORS = ['#3F6C51', '#9C6B26', '#4C5A4F', '#7A4C6D', '#2F5A73'];
const SCHEDULES: Schedule[] = ['daily', 'weekdays', 'custom'];

export function AddEditHabit({ habit, onDone, onCancel }: Props) {
  const [name, setName] = useState(habit?.name ?? '');
  const [color, setColor] = useState(habit?.color ?? COLORS[0]);
  const [schedule, setSchedule] = useState<Schedule>(habit?.schedule ?? 'daily');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const { error } = habit
      ? await supabase.from('habits').update({ name, color, schedule }).eq('id', habit.id)
      : await supabase.from('habits').insert({ name, color, schedule });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onDone();
  }

  async function handleDelete() {
    if (!habit) return;
    if (!confirm(`Archive "${habit.name}"? Its history will be kept.`)) return;
    setSaving(true);
    const { error } = await supabase.from('habits').update({ is_archived: true }).eq('id', habit.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onDone();
  }

  return (
    <div className="screen">
      <header className="top-bar">
        <button type="button" className="btn-link" onClick={onCancel}>
          ← Cancel
        </button>
        <h1>{habit ? 'Edit habit' : 'Add habit'}</h1>
      </header>

      <form className="card" onSubmit={handleSubmit}>
        <label className="field">
          <span>Name</span>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="field">
          <span>Schedule</span>
          <select value={schedule} onChange={(e) => setSchedule(e.target.value as Schedule)}>
            {SCHEDULES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="field">
          <legend>Color</legend>
          <div className="color-row">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-swatch ${color === c ? 'selected' : ''}`}
                style={{ background: c }}
                aria-label={c}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </fieldset>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : habit ? 'Save changes' : 'Add habit'}
        </button>

        {habit && (
          <button type="button" className="btn-danger" onClick={handleDelete} disabled={saving}>
            Delete
          </button>
        )}
      </form>
    </div>
  );
}
