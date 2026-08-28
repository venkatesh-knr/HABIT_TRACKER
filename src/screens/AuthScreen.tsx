import { useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen auth-screen">
      <h1 className="brand">Ritual</h1>
      <p className="subtitle">A simple daily habit tracker</p>

      <form className="card" onSubmit={handleSubmit}>
        <h2>{mode === 'signin' ? 'Sign in' : 'Create account'}</h2>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Register'}
        </button>

        <button
          type="button"
          className="btn-link"
          onClick={() => {
            setMode(mode === 'signin' ? 'register' : 'signin');
            setError(null);
          }}
        >
          {mode === 'signin' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
