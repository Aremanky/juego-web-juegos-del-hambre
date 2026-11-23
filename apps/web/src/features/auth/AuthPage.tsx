import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { UserDTO } from '@ceniza/shared';
import { Emblem, Spinner } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { keys, useMe, useServerInfo } from '../../lib/queries';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { data: me, isLoading } = useMe();
  const { data: info } = useServerInfo();
  const [params] = useSearchParams();
  const next = params.get('next') && params.get('next')!.startsWith('/') ? params.get('next')! : '/menu';
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', displayName: '', password: '', registrationCode: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isLoading)
    return (
      <div className="center-fill">
        <Spinner />
      </div>
    );
  if (me) return <Navigate to={next} replace />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body =
        mode === 'login'
          ? { username: form.username, password: form.password }
          : { username: form.username, displayName: form.displayName || form.username, password: form.password, registrationCode: form.registrationCode || undefined };
      const res = await api.post<{ user: UserDTO }>(mode === 'login' ? '/api/auth/login' : '/api/auth/register', body);
      qc.setQueryData(keys.me, res.user);
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const nextQ = params.get('next') ? `?next=${encodeURIComponent(next)}` : '';

  return (
    <main className="auth">
      <Link to="/" className="auth-brand" aria-label="Inicio">
        <Emblem size={72} />
      </Link>
      <form className="panel auth-card" onSubmit={submit} noValidate>
        <div className="tabs" role="tablist">
          <Link role="tab" aria-selected={mode === 'login'} to={`/entrar${nextQ}`} className="auth-tab">
            Entrar
          </Link>
          <Link role="tab" aria-selected={mode === 'register'} to={`/registro${nextQ}`} className="auth-tab">
            Crear cuenta
          </Link>
        </div>
        <h1 className="auth-title">{mode === 'login' ? 'Entra en tu cuenta' : 'Crea tu cuenta'}</h1>
        <p className="muted small">{mode === 'login' ? 'Tu sesión se recordará en este navegador durante 30 días.' : 'Tus fotos y personajes quedarán guardados en el servidor, en cualquier dispositivo.'}</p>
        <div className="stack">
          <label className="field">
            <span>Usuario</span>
            <input className="input" autoComplete="username" value={form.username} onChange={set('username')} required minLength={3} maxLength={mode === 'login' ? 64 : 20} autoFocus />
          </label>
          {mode === 'register' && (
            <label className="field">
              <span>Nombre visible</span>
              <input className="input" autoComplete="nickname" value={form.displayName} onChange={set('displayName')} maxLength={24} placeholder={form.username || 'Como te verán tus amigos'} />
            </label>
          )}
          <label className="field">
            <span>Contraseña</span>
            <input className="input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={set('password')} required minLength={mode === 'login' ? 1 : 8} />
            {mode === 'register' && <span className="hint">Mínimo 8 caracteres.</span>}
          </label>
          {mode === 'register' && info?.registrationRequiresCode && (
            <label className="field">
              <span>Código de registro</span>
              <input className="input" value={form.registrationCode} onChange={set('registrationCode')} required />
              <span className="hint">Pídeselo a quien administra el servidor.</span>
            </label>
          )}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
            {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </div>
      </form>
    </main>
  );
}
