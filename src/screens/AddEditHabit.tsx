import { useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import type { Habit, Schedule, TargetType } from '../types';
import type { LibraryHabit } from '../lib/habitLibrary';

interface Props {
  habit: Habit | null;
  prefill?: LibraryHabit | null;
  onDone: () => void;
  onCancel: () => void;
}

const COLORS = ['#3F6C51', '#9C6B26', '#4C5A4F', '#7A4C6D', '#2F5A73'];
const SCHEDULES: Schedule[] = ['daily', 'weekdays', 'custom'];

export function AddEditHabit({ habit, prefill, onDone, onCancel }: Props) {
  const [name, setName] = useState(habit?.name ?? prefill?.name ?? '');
  const [color, setColor] = useState(habit?.color ?? prefill?.color ?? COLORS[0]);
  const [schedule, setSchedule] = useState<Schedule>(habit?.schedule ?? prefill?.schedule ?? 'daily');
  const [targetType, setTargetType] = useState<TargetType>(habit?.target_type ?? prefill?.target_type ?? 'boolean');
  const [targetValue, setTargetValue] = useState(String(habit?.target_value ?? prefill?.target_value ?? ''));
  const [targetUnit, setTargetUnit] = useState(habit?.target_unit ?? prefill?.target_unit ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (targetType === 'count' && (!targetValue || Number(targetValue) <= 0)) {
      setError('Enter a target greater than 0.');
      return;
    }

    setSaving(true);
    const payload = {
      name,
      color,
      schedule,
      target_type: targetType,
      target_value: targetType === 'count' ? Number(targetValue) : null,
      target_unit: targetType === 'count' ? targetUnit.trim() || null : null,
    };
    const { error } = habit
      ? await supabase.from('habits').update(payload).eq('id', habit.id)
      : await supabase.from('habits').insert(payload);
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

        <fieldset className="field">
          <legend>Goal</legend>
          <div className="goal-toggle">
            <button
              type="button"
              className={`goal-option ${targetType === 'boolean' ? 'selected' : ''}`}
              onClick={() => setTargetType('boolean')}
            >
              Simple (done / not done)
            </button>
            <button
              type="button"
              className={`goal-option ${targetType === 'count' ? 'selected' : ''}`}
              onClick={() => setTargetType('count')}
            >
              Count target
            </button>
          </div>

          {targetType === 'count' && (
            <div className="goal-count-row">
              <input
                type="number"
                min={1}
                placeholder="Target"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                required
              />
              <input
                type="text"
                placeholder="unit (e.g. glasses)"
                value={targetUnit}
                onChange={(e) => setTargetUnit(e.target.value)}
              />
            </div>
          )}
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
