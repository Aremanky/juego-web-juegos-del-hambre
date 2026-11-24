import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Link } from 'react-router';
import { routePosition, type GameMap } from '@ceniza/engine';
import { dayPhase, districtById, type ActorView, type LobbyState, type MatchSnapshot } from '@ceniza/shared';
import { ConfirmButton, Portrait } from '../../components/ui';
import { emitAck } from '../../lib/socket';
import { gameNow, presentationProgress, serverNow, useMatch } from '../../stores/match';
import { act } from '../lobby/LobbyParts';
import { statusText } from './card';
import { MapCanvas, type MapApi } from './MapCanvas';
import { ParticipantCard } from './ParticipantCard';
import { formatEta, previewFor, type Preview } from './plan';

/** Repinta cada `ms` para las cuentas atrás. */
function useTicker(ms = 250) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

const frameOf = (a: ActorView) => (a.frame as Parameters<typeof Portrait>[0]['frame']) ?? 'sencillo';

export function MatchPage({ lobby }: { lobby: LobbyState }) {
  const m = useMatch();
  const mapApi = useRef<MapApi | null>(null);
  const [showResults, setShowResults] = useState(true);
  const [holo, setHolo] = useState(false);
  /** Vista previa táctil de la orden de ir (la del botón «Ir»). */
  const [preview, setPreview] = useState<Preview | null>(null);
  /** Participante cuya tarjeta está abierta y junto a qué punto del mapa se abrió. */
  const [cardId, setCardId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const openCard = (id: string | null) => {
    setCardId(id);
    setAnchor(id ? (mapApi.current?.anchorOf(id) ?? null) : null);
  };
  // Para la distancia y el tiempo de la tarjeta, la misma cuenta que la vista previa (solo hace falta el terreno).
  const grid = useMemo<GameMap | null>(
    () => (m.tiles && m.heights ? { size: m.size, tiles: m.tiles, heights: m.heights, center: m.center, pois: [], rivers: [], roads: [] } : null),
    [m.tiles, m.heights, m.size, m.center],
  );
  // Con ratón la ruta se ve al pasar por encima; con el dedo, al primer toque.
  const mouse = useMemo(() => typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches, []);
  useTicker(250);

  // Si la instantánea llegó antes de montar la pantalla, se pide otra.
  useEffect(() => {
    m.wire();
    if (!m.matchId) {
      void emitAck<MatchSnapshot>('match:sync')
        .then((s) => useMatch.getState().applySnapshot(s))
        .catch(() => undefined);
    }
    return () => useMatch.getState().reset();
  }, []);

  if (!m.matchId || !m.phase) {
    return (
      <main className="page">
        <p className="muted">Cargando la arena…</p>
      </main>
    );
  }

  const actors = m.order.map((id) => m.actors[id]).filter(Boolean);
  const me = m.me ? m.actors[m.me] : null;
  const alive = actors.filter((a) => a.alive);
  const myUser = lobby.me.userId;
  const canAct = !!me?.alive && m.phase === 'en_curso' && !m.paused;
  const iVoted = !!m.vote && (m.vote.yes.includes(myUser) || m.vote.no.includes(myUser));

  const goTo = (x: number, y: number) => {
    if (!canAct) return;
    void act('match:move', { x, y });
  };

  // Tarjeta abierta: dónde está para ti (si lo ves, con tu ruta; si no, dónde lo viste) y si puedes ir.
  let card: ReactNode = null;
  const cardActor = cardId ? (m.actors[cardId] ?? null) : null;
  if (cardActor) {
    const now = gameNow();
    const lastSeen = m.lastSeen[cardActor.id];
    const live = cardActor.alive && cardActor.seen;
    const pos = live ? (cardActor.route ? routePosition(cardActor.route, now) : { x: cardActor.x, y: cardActor.y }) : (lastSeen ?? null);
    const cell = pos ? { x: Math.round(pos.x), y: Math.round(pos.y) } : null;
    const p = grid && cell && live && cardActor.id !== m.me ? previewFor(grid, me, cell, now) : null;
    const trip = p && p.error === null ? { cells: p.cells, eta: p.eta } : null;
    const go = canAct && cardActor.alive && cardActor.id !== m.me && cell ? cell : null;
    card = (
      <ParticipantCard
        key={cardActor.id}
        actor={cardActor}
        me={m.me}
        lastSeen={lastSeen}
        now={now}
        bot={lobby.participants.find((x) => x.id === cardActor.id)?.bot ?? null}
        trip={trip}
        anchor={anchor}
        onClose={() => openCard(null)}
        onGo={
          go
            ? () => {
                goTo(go.x, go.y);
                openCard(null);
              }
            : null
        }
      />
    );
  }

  return (
    <main className="match">
      <div className="match-stage">
        <MapCanvas onCell={goTo} onActor={openCard} onPreview={setPreview} modal={!!cardId} apiRef={mapApi} />
        <div className="match-top">
          <h1 className="match-title">{lobby.room.name}</h1>
          <div className="match-status">
            {m.day && m.phase === 'en_curso' && <DayClock />}
            <span className="match-count num">
              Quedan {alive.length} de {actors.length}
            </span>
          </div>
        </div>
        <div className="map-tools" role="group" aria-label="Vista del mapa">
          <button className="btn btn-sm" onClick={() => mapApi.current?.zoom(1.25)} aria-label="Acercar">
            +
          </button>
          <button className="btn btn-sm" onClick={() => mapApi.current?.zoom(0.8)} aria-label="Alejar">
            −
          </button>
          <button className="btn btn-sm" onClick={() => mapApi.current?.centerOnMe()}>
            Centrar
          </button>
          <button className="btn btn-sm" aria-pressed={holo} onClick={() => setHolo(mapApi.current?.toggleMode() === 'holograma')}>
            {holo ? 'Mapa' : 'Holograma'}
          </button>
        </div>
        {canAct && !preview && (
          <p className="map-hint">
            {mouse
              ? 'Pasa el ratón para ver la ruta y el tiempo. Haz clic para ir, o en alguien para ver su tarjeta.'
              : 'Toca una casilla para ver la ruta y otra vez para ir. Toca a alguien para ver su tarjeta.'}
          </p>
        )}
        {canAct && preview && (
          <div className="go-bar" role="group" aria-label="Ruta prevista">
            {preview.error !== null ? (
              <p className="go-error">{preview.error}</p>
            ) : (
              <button
                className="btn btn-gold go-btn"
                onClick={() => {
                  goTo(preview.x, preview.y);
                  mapApi.current?.clearPreview();
                }}
              >
                Ir · {formatEta(preview.eta)}
              </button>
            )}
            <button className="btn go-close" aria-label="Quitar la ruta prevista" onClick={() => mapApi.current?.clearPreview()}>
              <X size={18} aria-hidden />
            </button>
          </div>
        )}

        {card}

        {m.phase === 'presentacion' && <Presentation actors={actors} mapSize={m.size} />}
        {m.phase === 'cuenta_atras' && m.phaseEndsAt != null && !m.paused && <Countdown endsAt={m.phaseEndsAt} />}
        {m.paused && <PauseOverlay myUser={myUser} amAlive={!!me?.alive} />}
        {m.phase === 'terminada' && showResults && <Results actors={actors} winnerId={m.winnerId} onClose={() => setShowResults(false)} />}
      </div>

      <aside className="match-side">
        {m.vote && !m.paused && (
          <section className="panel vote-box" aria-live="polite">
            <p>
              <strong>{m.vote.byName}</strong> propone una pausa. Van {m.vote.yes.length} de {m.vote.needed} votos.
            </p>
            {me?.alive && !iVoted ? (
              <div className="row-actions">
                <button className="btn btn-gold" onClick={() => void act('match:vote', { yes: true })}>
                  Pausar
                </button>
                <button className="btn" onClick={() => void act('match:vote', { yes: false })}>
                  Seguir jugando
                </button>
              </div>
            ) : (
              <p className="small faint">Esperando al resto. La votación caduca en {Math.max(0, Math.ceil((m.vote.endsAt - serverNow()) / 1000))} s.</p>
            )}
          </section>
        )}

        <section className="panel me-box">
          {me ? (
            <>
              <div className="me-head">
                <Portrait portrait={me.portrait} look={me.look} color={me.color} frame={frameOf(me)} size={56} />
                <div>
                  <div className="display me-name">{me.name}</div>
                  <div className="small faint">
                    Distrito {districtById(me.district)?.roman}, {districtById(me.district)?.name}
                  </div>
                </div>
              </div>
              {m.pois.length > 1 && <Explored explored={me.explored ?? 0} />}
              {me.alive ? (
                <div className="row-actions">
                  {me.route && canAct && (
                    <button className="btn" onClick={() => void act('match:stop', {})}>
                      Parar
                    </button>
                  )}
                  {m.phase === 'en_curso' && !m.paused && !m.vote && (
                    <button className="btn" onClick={() => void act('match:pause', {})}>
                      Proponer pausa
                    </button>
                  )}
                  {m.phase !== 'terminada' && (
                    <ConfirmButton className="btn btn-danger" confirmText="¿Seguro? Quedarás fuera" onConfirm={() => void act('match:forfeit', {})}>
                      Abandonar la partida
                    </ConfirmButton>
                  )}
                </div>
              ) : (
                <p className="muted small">{m.phase === 'terminada' && me.place === 1 ? 'Has ganado.' : 'Estás fuera de la arena, pero puedes seguir mirando.'}</p>
              )}
            </>
          ) : (
            <p className="muted">Estás mirando esta partida.</p>
          )}
        </section>

        <section className="panel">
          <h2>Participantes</h2>
          <ul className="roster">
            {[...actors]
              .sort((a, b) => Number(b.alive) - Number(a.alive) || (a.place ?? 99) - (b.place ?? 99) || a.district - b.district)
              .map((a) => (
                <li key={a.id} className={`roster-row${a.alive ? '' : ' out'}${a.id === m.me ? ' mine' : ''}`}>
                  <button type="button" className="roster-btn" onClick={() => openCard(a.id)} aria-haspopup="dialog">
                    <Portrait portrait={a.portrait} look={a.look} color={a.color} frame="sencillo" size={34} bot={a.kind === 'bot'} grayscale={!a.alive} />
                    <span className="roster-text">
                      <strong>{a.name}</strong>
                      <span className="small faint">{statusText(a, m.me)}</span>
                    </span>
                    <span className="display small faint">{districtById(a.district)?.roman}</span>
                  </button>
                </li>
              ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Lo que ha pasado</h2>
          {m.log.length ? (
            <ol className="match-log">
              {[...m.log].reverse().slice(0, 14).map((e, i) =>
                e.kind === 'dice' && e.say ? (
                  <li key={`${e.at}-${i}`} className="log-say">
                    <span className="log-who">{(e.actorId && m.actors[e.actorId]?.name) || e.text.split(':')[0]}</span> «{e.say}»
                  </li>
                ) : (
                  <li key={`${e.at}-${i}`}>{e.text}</li>
                ),
              )}
            </ol>
          ) : (
            <p className="small faint">Todavía nada. Los avisos de la partida aparecerán aquí.</p>
          )}
          <Link className="btn btn-ghost btn-sm" to="/menu">
            Ir al menú (la partida sigue)
          </Link>
        </section>
      </aside>
    </main>
  );
}

function Presentation({ actors, mapSize }: { actors: ActorView[]; mapSize: number }) {
  // Primero el sobrevuelo de la arena (el mapa se ve entero detrás) y después los Elegidos.
  const flyover = presentationProgress() < 0.4;
  const list = [...actors].sort((a, b) => a.district - b.district || a.gender.localeCompare(b.gender));
  if (flyover) {
    return (
      <div className="overlay presentation flyover">
        <div className="arena-caption">
          <h2 className="display presentation-title">La arena</h2>
          <p>
            {mapSize} por {mapSize} casillas, generada para esta partida. En el centro, la explanada del Obelisco.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="overlay presentation">
      <h2 className="display presentation-title">Los Elegidos</h2>
      <ul className="tribute-grid">
        {list.map((a, i) => {
          const d = districtById(a.district);
          return (
            <li key={a.id} className="tribute" style={{ animationDelay: `${i * 90}ms` }}>
              <Portrait portrait={a.portrait} look={a.look} color={a.color} frame={frameOf(a)} size={64} bot={a.kind === 'bot'} />
              <strong className="display">{a.name}</strong>
              {a.epithet && <span className="small muted">{a.epithet}</span>}
              <span className="small faint">
                Distrito {d?.roman}, {d?.name}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Reloj de día y noche de la arena. */
function DayClock() {
  const day = useMatch((s) => s.day)!;
  const ph = dayPhase(gameNow(), day);
  const left = Math.max(0, Math.ceil(ph.left / 1000));
  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return (
    <span className={`match-clock num${ph.night ? ' night' : ''}`}>
      {ph.night ? `Noche ${ph.index}. Amanece en ${mmss}` : `Día ${ph.index}. Anochece en ${mmss}`}
    </span>
  );
}

/** Regiones descubiertas: el nombre de cada una aparece en el mapa al llegar. */
function Explored({ explored }: { explored: number }) {
  const pois = useMatch((s) => s.pois);
  const found = pois.filter((p) => explored & (1 << p.id));
  return (
    <div className="explored">
      <p className="small">
        Has descubierto <strong>{found.length}</strong> de {pois.length} regiones.
      </p>
      <p className="small faint">{found.map((p) => p.name).join(', ')}</p>
    </div>
  );
}

function Countdown({ endsAt }: { endsAt: number }) {
  const left = Math.max(0, Math.ceil((endsAt - gameNow()) / 1000));
  return (
    <div className="overlay countdown" aria-live="assertive">
      <span className="display countdown-num">{left}</span>
      <p>Todos en el anillo del Obelisco. Nadie se mueve hasta el final de la cuenta atrás.</p>
    </div>
  );
}

function PauseOverlay({ myUser, amAlive }: { myUser: string; amAlive: boolean }) {
  const paused = useMatch((s) => s.paused)!;
  const actors = useMatch((s) => s.actors);
  const byUser = new Map(Object.values(actors).filter((a) => a.userId).map((a) => [a.userId!, a]));
  const iAmReady = paused.ready.includes(myUser);
  const canDecide = amAlive && paused.needed.includes(myUser);
  return (
    <div className="overlay pause">
      <div className="panel pause-box">
        <h2>Partida en pausa</h2>
        <p className="muted">{paused.reason === 'reinicio' ? 'El servidor se reinició. La partida está intacta y sigue cuando todos estéis listos.' : 'La mayoría ha votado una pausa. Sigue cuando todos los que están conectados pulsen «Listo».'}</p>
        <ul className="pause-list">
          {paused.needed.map((u) => (
            <li key={u}>
              <span>{byUser.get(u)?.name ?? 'Participante'}</span>
              <span className={paused.ready.includes(u) ? 'ok' : 'faint'}>{paused.ready.includes(u) ? 'Listo' : 'Esperando'}</span>
            </li>
          ))}
          {!paused.needed.length && <li className="faint">Nadie conectado todavía.</li>}
        </ul>
        {paused.resumeAt ? (
          <p className="resume-in">Se reanuda en {Math.max(0, Math.ceil((paused.resumeAt - serverNow()) / 1000))} s.</p>
        ) : null}
        {canDecide && (
          <button className={`btn btn-lg${iAmReady ? '' : ' btn-primary'}`} onClick={() => void act('match:resume', { ready: !iAmReady })}>
            {iAmReady ? 'Ya no estoy listo' : 'Listo para seguir'}
          </button>
        )}
      </div>
    </div>
  );
}

function Results({ actors, winnerId, onClose }: { actors: ActorView[]; winnerId: string | null; onClose: () => void }) {
  const winner = winnerId ? actors.find((a) => a.id === winnerId) : undefined;
  const ranking = [...actors].sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
  return (
    <div className="overlay results">
      <div className="panel results-box">
        {winner ? (
          <div className="winner">
            <Portrait portrait={winner.portrait} look={winner.look} color={winner.color} frame={frameOf(winner)} size={112} />
            <h2 className="display winner-name">{winner.name}</h2>
            <p className="muted">gana los Juegos de la Ceniza</p>
          </div>
        ) : (
          <h2>La partida termina sin ganador</h2>
        )}
        <ol className="ranking">
          {ranking.map((a) => (
            <li key={a.id}>
              <span className="num rank">{a.place ?? '—'}</span>
              <span>{a.name}</span>
              <span className="small faint">{a.place === 1 ? 'Ganador' : a.cause === 'desconexion' ? 'Desconexión' : 'Abandono'}</span>
            </li>
          ))}
        </ol>
        <div className="row-actions">
          <Link className="btn btn-primary" to="/menu">
            Volver al menú
          </Link>
          <button className="btn" onClick={onClose}>
            Ver el mapa
          </button>
        </div>
      </div>
    </div>
  );
}
