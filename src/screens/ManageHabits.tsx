import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/feedback';
import type { Habit } from '../types';

interface Props {
  onHabitsChanged: () => void;
  onOpenLibrary: () => void;
  onAddHabit: () => void;
}

export function ManageHabits({ onHabitsChanged, onOpenLibrary, onAddHabit }: Props) {
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [habits, setHabits] = useState<Habit[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const showToast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('habits')
      .select('*')
      .eq('is_archived', tab === 'archived')
      .order('created_at');
    setHabits(data ?? []);
    setSelected(new Set());
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(habits.map((h) => h.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function bulkSetArchived(archived: boolean) {
    if (selected.size === 0) return;
    setBusy(true);
    const { error } = await supabase.from('habits').update({ is_archived: archived }).in('id', Array.from(selected));
    setBusy(false);
    if (error) {
      showToast(error.message);
      return;
    }
    await load();
    onHabitsChanged();
  }

  return (
    <div className="screen">
      <header className="top-bar">
        <h1>Habits</h1>
      </header>

      <div className="segmented">
        <button type="button" className={tab === 'active' ? 'selected' : ''} onClick={() => setTab('active')}>
          Active
        </button>
        <button type="button" className={tab === 'archived' ? 'selected' : ''} onClick={() => setTab('archived')}>
          Archived
        </button>
      </div>

      <div className="manage-actions">
        <button type="button" className="btn-link" onClick={onOpenLibrary}>
          Browse habit library
        </button>
        <button type="button" className="btn-link" onClick={onAddHabit}>
          + Add custom habit
        </button>
      </div>

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : habits.length === 0 ? (
        <p className="subtitle">{tab === 'active' ? 'No active habits.' : 'No archived habits.'}</p>
      ) : (
        <>
          <div className="select-bar">
            <button type="button" className="btn-link" onClick={selectAll}>
              Select all
            </button>
            <button type="button" className="btn-link" onClick={clearSelection}>
              Clear
            </button>
            <span className="subtitle">{selected.size} selected</span>
          </div>

          <ul className="habit-list">
            {habits.map((h) => (
              <li key={h.id} className="habit-row">
                <label className="select-checkbox">
                  <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggleSelect(h.id)} />
                </label>
                <span className="chip-dot" style={{ background: h.color }} />
                <span className="habit-name" style={{ cursor: 'default' }}>
                  <span>{h.name}</span>
                </span>
              </li>
            ))}
          </ul>

          {selected.size > 0 && (
            <div className="bulk-bar">
              {tab === 'active' ? (
                <button type="button" className="btn-danger" disabled={busy} onClick={() => bulkSetArchived(true)}>
                  Archive selected
                </button>
              ) : (
                <button type="button" className="btn-primary" disabled={busy} onClick={() => bulkSetArchived(false)}>
                  Restore selected
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
