import { useEffect } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router';
import { GlyphCamafeo, GlyphFoto, GlyphObelisco, GlyphPuerta } from './glyphs';
import { Emblem, Spinner } from './ui';
import { useMe, useServerInfo } from '../lib/queries';
import { api } from '../lib/api';
import { closeSocket, getSocket, useConnection } from '../lib/socket';
import { useLobby } from '../stores/lobby';
import { photoRefSrc } from '../lib/media';

/** Rutas privadas: exige sesión, abre el socket y pinta la barra superior. */
export function AppShell() {
  const { data: me, isLoading } = useMe();
  const { data: info } = useServerInfo();
  const location = useLocation();
  const conn = useConnection((s) => s.status);

  useEffect(() => {
    if (!me) return;
    getSocket();
    useLobby.getState().wire();
  }, [me]);

  if (isLoading) {
    return (
      <div className="center-fill">
        <Spinner />
      </div>
    );
  }
  if (!me) return <Navigate to={`/entrar?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;

  const logout = async () => {
    await api.post('/api/auth/logout').catch(() => undefined);
    closeSocket();
    window.location.assign('/');
  };

  return (
    <>
      <header className="topbar">
        <Link to="/menu" className="brand" aria-label="Menú principal">
          <Emblem size={34} />
          <span className="brand-name">{info?.appName ?? 'Los Juegos de la Ceniza'}</span>
        </Link>
        <nav className="topnav" aria-label="Principal">
          <NavLink to="/menu">
            <GlyphObelisco />
            <span>Menú</span>
          </NavLink>
          <NavLink to="/personajes">
            <GlyphCamafeo />
            <span>Personajes</span>
          </NavLink>
          <NavLink to="/fotos">
            <GlyphFoto />
            <span>Fotos</span>
          </NavLink>
          <NavLink to="/perfil" title="Perfil">
            <img src={photoRefSrc(me.defaultPhoto, me.id, 28)} alt="" width={26} height={26} style={{ borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--line)' }} />
            <span>{me.displayName}</span>
          </NavLink>
          <span
            className={`netdot${conn === 'online' ? '' : ' off'}`}
            role="status"
            title={conn === 'online' ? 'Conectado en tiempo real' : 'Reconectando…'}
            aria-label={conn === 'online' ? 'Conectado en tiempo real' : 'Reconectando'}
          />
          <button className="btn btn-ghost btn-sm logout" onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión">
            <GlyphPuerta />
            <span>Salir</span>
          </button>
        </nav>
      </header>
      <Outlet />
    </>
  );
}
