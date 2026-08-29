import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import type { Habit } from './types';
import type { LibraryHabit } from './lib/habitLibrary';
import { AuthScreen } from './screens/AuthScreen';
import { GetStarted } from './screens/GetStarted';
import { Today } from './screens/Today';
import { Calendar } from './screens/Calendar';
import { Stats } from './screens/Stats';
import { ManageHabits } from './screens/ManageHabits';
import { HabitLibrary } from './screens/HabitLibrary';
import { AddEditHabit } from './screens/AddEditHabit';
import { NavBar } from './components/NavBar';
import type { Tab } from './components/NavBar';
import './App.css';

type Overlay = { name: 'addEdit'; habit: Habit | null; prefill?: LibraryHabit | null } | { name: 'library' };

function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [hasEverHadHabit, setHasEverHadHabit] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [focusHabitId, setFocusHabitId] = useState<string | null>(null);

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
      setTab('today');
      setOverlay(null);
    }
  }, [userId, loadHabits]);

  function selectTab(next: Tab) {
    setTab(next);
    setOverlay(null);
    setFocusHabitId(null);
  }

  function viewHabitHistory(habitId: string) {
    setFocusHabitId(habitId);
    setTab('calendar');
  }

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

  if (!hasEverHadHabit) {
    return (
      <GetStarted
        onHabitAdded={loadHabits}
        onAddCustom={() => setOverlay({ name: 'addEdit', habit: null })}
      />
    );
  }

  if (overlay?.name === 'addEdit') {
    return (
      <AddEditHabit
        habit={overlay.habit}
        prefill={overlay.prefill}
        onDone={async () => {
          await loadHabits();
          setOverlay(null);
        }}
        onCancel={() => setOverlay(null)}
      />
    );
  }

  if (overlay?.name === 'library') {
    return (
      <HabitLibrary
        onBack={() => setOverlay(null)}
        onPick={(libHabit) => setOverlay({ name: 'addEdit', habit: null, prefill: libHabit })}
      />
    );
  }

  return (
    <>
      {tab === 'today' && (
        <Today
          habits={habits}
          onAddHabit={() => setOverlay({ name: 'addEdit', habit: null })}
          onEditHabit={(habitId) => setOverlay({ name: 'addEdit', habit: habits.find((h) => h.id === habitId) ?? null })}
          onViewHistory={viewHabitHistory}
          onSignOut={() => supabase.auth.signOut()}
        />
      )}
      {tab === 'calendar' && <Calendar habits={habits} initialHabitId={focusHabitId} />}
      {tab === 'stats' && <Stats habits={habits} />}
      {tab === 'habits' && (
        <ManageHabits
          onHabitsChanged={loadHabits}
          onOpenLibrary={() => setOverlay({ name: 'library' })}
          onAddHabit={() => setOverlay({ name: 'addEdit', habit: null })}
        />
      )}
      <NavBar active={tab} onSelect={selectTab} />
    </>
  );
}

export default App;
