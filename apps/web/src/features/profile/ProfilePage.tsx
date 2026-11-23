import { useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { UserDTO } from '@ceniza/shared';
import { api, errorMessage } from '../../lib/api';
import { keys, useMe } from '../../lib/queries';
import { photoRefSrc } from '../../lib/media';
import { toast } from '../../stores/toast';
import { closeSocket } from '../../lib/socket';
import { ConfirmButton } from '../../components/ui';

export function ProfilePage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [name, setName] = useState(me?.displayName ?? '');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });

  if (!me) return null;

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await api.patch<{ user: UserDTO }>('/api/users/me', { displayName: name });
      qc.setQueryData(keys.me, r.user);
      toast.success('Nombre actualizado');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const savePw = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/users/me/password', pw);
      setPw({ currentPassword: '', newPassword: '' });
      toast.success('Contraseña cambiada. Se han cerrado tus otras sesiones.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const logoutAll = async () => {
    await api.post('/api/auth/logout-all').catch(() => undefined);
    closeSocket();
    window.location.assign('/');
  };

  return (
    <main className="page page-narrow">
      <div className="page-head">
        <div className="row">
          <img src={photoRefSrc(me.defaultPhoto, me.id, 128)} alt="" width={72} height={72} style={{ borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--oro)' }} />
          <div>
            <h1>{me.displayName}</h1>
            <p className="muted small" style={{ margin: 0 }}>
              @{me.username}
              {me.role === 'admin' ? ', administrador' : ''}. Cuenta creada el {new Date(me.createdAt).toLocaleDateString('es-ES')}.
            </p>
          </div>
        </div>
        <Link className="btn" to="/fotos">
          Cambiar foto
        </Link>
      </div>

      <div className="stack">
        <form className="panel stack" onSubmit={saveName}>
          <h2>Nombre visible</h2>
          <label className="field">
            <span>Así te verán en salas y chats</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} minLength={2} />
          </label>
          <div>
            <button className="btn btn-primary" disabled={name.trim().length < 2 || name === me.displayName}>
              Guardar nombre
            </button>
          </div>
        </form>

        <form className="panel stack" onSubmit={savePw}>
          <h2>Contraseña</h2>
          <label className="field">
            <span>Contraseña actual</span>
            <input className="input" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          </label>
          <label className="field">
            <span>Contraseña nueva</span>
            <input className="input" type="password" autoComplete="new-password" minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </label>
          <div>
            <button className="btn" disabled={!pw.currentPassword || pw.newPassword.length < 8}>
              Cambiar contraseña
            </button>
          </div>
        </form>

        <section className="panel stack">
          <h2>Sesiones</h2>
          <p className="muted">Si has entrado desde un ordenador que no es tuyo, cierra la sesión en todos los dispositivos.</p>
          <div>
            <ConfirmButton onConfirm={logoutAll}>Cerrar sesión en todos los dispositivos</ConfirmButton>
          </div>
        </section>
      </div>
    </main>
  );
}
