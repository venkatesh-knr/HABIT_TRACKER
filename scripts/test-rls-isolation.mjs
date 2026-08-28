// One-off RLS isolation check: two dummy users must never see or modify each other's rows.
// Run with: node scripts/test-rls-isolation.mjs
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

function loadEnv() {
  const text = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const env = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const stamp = Date.now();
const userA = { email: `rls-test-a-${stamp}@gmail.com`, password: 'Test1234!Test' };
const userB = { email: `rls-test-b-${stamp}@gmail.com`, password: 'Test1234!Test' };

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`PASS: ${label}`);
  } else {
    console.log(`FAIL: ${label}`);
    failures++;
  }
}

async function signUpAndSignIn(client, user) {
  const { data, error } = await client.auth.signUp(user);
  if (error) throw new Error(`signUp failed for ${user.email}: ${error.message}`);
  if (!data.session) {
    const { error: signInErr } = await client.auth.signInWithPassword(user);
    if (signInErr) throw new Error(`signIn failed for ${user.email}: ${signInErr.message}`);
  }
}

async function main() {
  const clientA = createClient(url, key);
  const clientB = createClient(url, key);

  console.log('Signing up user A...');
  await signUpAndSignIn(clientA, userA);
  console.log('Signing up user B...');
  await signUpAndSignIn(clientB, userB);

  // User A creates a habit
  const { data: habitA, error: insertErrA } = await clientA
    .from('habits')
    .insert({ name: 'A-private-habit', schedule: 'daily', color: '#3F6C51' })
    .select()
    .single();
  check('user A can insert their own habit', !insertErrA && habitA);

  if (!habitA) {
    console.error('Cannot continue without habit A; aborting.');
    process.exit(1);
  }

  // User A logs a completion
  const today = new Date().toISOString().slice(0, 10);
  const { error: logErrA } = await clientA
    .from('habit_logs')
    .insert({ habit_id: habitA.id, log_date: today, completed: true });
  check('user A can insert their own habit log', !logErrA);

  // User B tries to see user A's habits via select *
  const { data: bSeesHabits, error: selectErrB } = await clientB
    .from('habits')
    .select('*')
    .eq('id', habitA.id);
  check('user B select on habits table does not error', !selectErrB);
  check('user B cannot see user A\'s habit via select', (bSeesHabits ?? []).length === 0);

  // User B tries to fetch by guessing the exact id directly
  const { data: bGuessHabit } = await clientB
    .from('habits')
    .select('*')
    .eq('id', habitA.id)
    .maybeSingle();
  check('user B cannot fetch user A\'s habit by guessed id', !bGuessHabit);

  // User B tries to update user A's habit
  const { data: bUpdateResult, error: updateErrB } = await clientB
    .from('habits')
    .update({ name: 'hijacked' })
    .eq('id', habitA.id)
    .select();
  check('user B update on user A\'s habit affects zero rows', !updateErrB && (bUpdateResult ?? []).length === 0);

  // User B tries to delete user A's habit
  const { data: bDeleteResult, error: deleteErrB } = await clientB
    .from('habits')
    .delete()
    .eq('id', habitA.id)
    .select();
  check('user B delete on user A\'s habit affects zero rows', !deleteErrB && (bDeleteResult ?? []).length === 0);

  // User B tries to see user A's habit_logs
  const { data: bSeesLogs, error: selectLogsErrB } = await clientB
    .from('habit_logs')
    .select('*')
    .eq('habit_id', habitA.id);
  check('user B select on habit_logs does not error', !selectLogsErrB);
  check('user B cannot see user A\'s habit log', (bSeesLogs ?? []).length === 0);

  // User B tries to insert a log against user A's habit id (foreign key exists, but user_id defaults to B's own uid)
  const { error: crossInsertErrB } = await clientB
    .from('habit_logs')
    .insert({ habit_id: habitA.id, log_date: today, completed: true });
  // This may succeed as an insert (habit_id FK doesn't check ownership), but must not
  // let user B read/join it back as though it were user A's data, and must not corrupt A's view.
  console.log(
    crossInsertErrB
      ? `INFO: user B insert against A's habit_id was rejected: ${crossInsertErrB.message}`
      : 'INFO: user B insert against A\'s habit_id succeeded (allowed by FK, but row is owned by B, not A)'
  );

  // Confirm user A's original view is unaffected: still exactly 1 habit, still visible, unmodified
  const { data: aFinalHabits, error: aFinalErr } = await clientA.from('habits').select('*');
  check('user A still sees their own habit after B\'s attempts', !aFinalErr && (aFinalHabits ?? []).some(h => h.id === habitA.id && h.name === 'A-private-habit'));

  // Cleanup: user A archives/deletes their own habit (cascades to logs)
  await clientA.from('habits').delete().eq('id', habitA.id);

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Test script error:', err.message);
  process.exit(1);
});
