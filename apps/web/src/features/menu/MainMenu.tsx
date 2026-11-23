import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CodeInput, Portrait } from '../../components/ui';
import { ChatPanel } from '../../components/ChatPanel';
import { useMe, useMyRooms, usePhotos, useTemplates } from '../../lib/queries';
import { useLobby } from '../../stores/lobby';
import { useConnection } from '../../lib/socket';
import { photoUrl } from '@ceniza/shared';

const STATUS_LABEL: Record<string, string> = { lobby: 'En preparación', starting: 'Empezando', in_game: 'En juego', paused: 'En pausa' };

export function MainMenu() {
  const { data: me } = useMe();
  const { data: rooms } = useMyRooms();
  const { data: templates } = useTemplates();
  const { data: photos } = usePhotos();
  const globalChat = useLobby((s) => s.globalChat);
  const online = useConnection((s) => s.status === 'online');
  const [code, setCode] = useState('');
  const navigate = useNavigate();
  const lead = templates?.[0];

  return (
    <main className="page menu">
      <section className="menu-hero">
        <div>
          <h1>Hola, {me?.displayName}</h1>
          <p className="muted">¿Abres una arena nueva o te unes a la de tus amigos?</p>
        </div>
        {lead && (
          <Link to={`/personajes/${lead.id}`} className="menu-lead" title="Tu personaje más reciente">
            <Portrait portrait={lead.data.portrait} color={lead.data.color} frame={lead.data.frame} size={64} />
            <span>
              <strong className="display">{lead.data.name}</strong>
              {lead.data.epithet && <span className="muted small"> {lead.data.epithet}</span>}
            </span>
          </Link>
        )}
      </section>

      <div className="menu-grid">
        <div className="menu-main">
          <section className="panel menu-create">
            <div>
              <h2>Crear sala</h2>
              <p className="muted">Elige ritmo, reglas y bots. Después comparte el código o el enlace con tus amigos.</p>
            </div>
            <Link className="btn btn-primary btn-lg" to="/salas/nueva">
              Crear sala
            </Link>
          </section>

          <section className="panel menu-join">
            <h2>Unirse con código</h2>
            <form
              className="menu-join-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.length === 6) navigate(`/r/${code}`);
              }}
            >
              <CodeInput value={code} onChange={setCode} />
              <button className="btn btn-gold btn-lg" type="submit" disabled={code.length !== 6}>
                Unirse
              </button>
            </form>
          </section>

          {!!rooms?.length && (
            <section className="panel">
              <h3>Tus salas abiertas</h3>
              <ul className="room-list">
                {rooms.map((r) => (
                  <li key={r.id}>
                    <Link to={`/sala/${r.code}`} className="room-row">
                      <span className="room-code num">{r.code}</span>
                      <span className="room-name">{r.name}</span>
                      <span className="chip">{STATUS_LABEL[r.status] ?? r.status}</span>
                      <span className="muted small num">
                        {r.humans + r.bots}/{r.maxParticipants}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="menu-shelf">
            <Link to="/personajes" className="shelf-item">
              <div className="shelf-faces">
                {(templates ?? []).slice(0, 4).map((t) => (
                  <Portrait key={t.id} portrait={t.data.portrait} color={t.data.color} frame="sencillo" size={40} />
                ))}
                {!templates?.length && <span className="shelf-empty" aria-hidden="true" />}
              </div>
              <div>
                <strong>Tus personajes</strong>
                <div className="muted small">{templates?.length ? `${templates.length} guardados` : 'Crea tu primer personaje'}</div>
              </div>
            </Link>
            <Link to="/fotos" className="shelf-item">
              <div className="shelf-faces">
                {(photos ?? []).slice(0, 4).map((p) => (
                  <img key={p.id} src={photoUrl(p.id, 'marker', p.v)} alt="" width={40} height={40} className="shelf-photo" />
                ))}
                {!photos?.length && <span className="shelf-empty" aria-hidden="true" />}
              </div>
              <div>
                <strong>Tus fotos</strong>
                <div className="muted small">{photos?.length ? `${photos.length} en tu biblioteca` : 'Sube una foto para el mapa'}</div>
              </div>
            </Link>
          </section>
        </div>

        <aside className="panel menu-chat" aria-label="Chat global">
          <div className="panel-title">
            <h3>Chat global</h3>
            <span className="conn">
              <span className={`dot${online ? ' on' : ''}`} /> {online ? 'en directo' : 'reconectando'}
            </span>
          </div>
          <ChatPanel channel="global" messages={globalChat} placeholder="Escribe a todo el servidor…" disabled={!online} />
        </aside>
      </div>
    </main>
  );
}
