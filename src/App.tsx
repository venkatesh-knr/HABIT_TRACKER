import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import type { Habit } from './types';
import { AuthScreen } from './screens/AuthScreen';
import { GetStarted } from './screens/GetStarted';
import { Today } from './screens/Today';
import { HabitHistory } from './screens/HabitHistory';
import { AddEditHabit } from './screens/AddEditHabit';
import './App.css';

type View = { name: 'today' } | { name: 'addEdit'; habitId: string | null } | { name: 'history'; habitId: string };

function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [hasEverHadHabit, setHasEverHadHabit] = useState<boolean | null>(null);
  const [view, setView] = useState<View>({ name: 'today' });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadHabits = useCallback(async () => {
    const [{ data: active }, { count }] = await Promise.all([
      supabase.from('habits').select('*').eq('is_archived', false).order('created_at'),
      supabase.from('habits').select('id', { count: 'exact', head: true }),
    ]);
    setHabits(active ?? []);
    setHasEverHadHabit((count ?? 0) > 0);
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (userId) {
      loadHabits();
    } else {
      setHabits([]);
      setHasEverHadHabit(null);
      setView({ name: 'today' });
    }
  }, [userId, loadHabits]);

  if (session === undefined) {
    return (
      <div className="screen">
        <p className="subtitle">Loading…</p>
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  if (hasEverHadHabit === null) {
    return (
      <div className="screen">
        <p className="subtitle">Loading…</p>
      </div>
    );
  }

  if (view.name === 'addEdit') {
    const habit = view.habitId ? habits.find((h) => h.id === view.habitId) ?? null : null;
    return (
      <AddEditHabit
        habit={habit}
        onDone={async () => {
          await loadHabits();
          setView({ name: 'today' });
        }}
        onCancel={() => setView({ name: 'today' })}
      />
    );
  }

  if (view.name === 'history') {
    const habit = habits.find((h) => h.id === view.habitId);
    if (!habit) {
      setView({ name: 'today' });
      return null;
    }
    return <HabitHistory habit={habit} onBack={() => setView({ name: 'today' })} />;
  }

  if (!hasEverHadHabit) {
    return (
      <GetStarted
        onHabitAdded={loadHabits}
        onAddCustom={() => setView({ name: 'addEdit', habitId: null })}
      />
    );
  }

  return (
    <Today
      habits={habits}
      onAddHabit={() => setView({ name: 'addEdit', habitId: null })}
      onEditHabit={(habitId) => setView({ name: 'addEdit', habitId })}
      onViewHistory={(habitId) => setView({ name: 'history', habitId })}
      onSignOut={() => supabase.auth.signOut()}
    />
  );
}

export default App;
