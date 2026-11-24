import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus } from 'lucide-react';
import { PACE_LABEL, ZONE_LABEL, defaultCharacter, districtById, mergeRoomConfig, summarizeBuild, type Character, type LobbyParticipant, type LobbyState, type RoomConfigPatch } from '@ceniza/shared';
import { ConfirmButton, Empty, Modal, Portrait, Spinner } from '../../components/ui';
import { ChatPanel } from '../../components/ChatPanel';
import { useLobby } from '../../stores/lobby';
import { keys, useMe, useTemplates } from '../../lib/queries';
import { api, errorMessage } from '../../lib/api';
import { newCid, useConnection } from '../../lib/socket';
import { toast } from '../../stores/toast';
import { CharacterEditor } from '../characters/CharacterEditor';
import { RoomConfigForm } from '../rooms/RoomConfigForm';
import { act, BotEditor, DistrictBoard, HumanCard, ParticipantList } from './LobbyParts';
import { MatchPage } from '../match/MatchPage';

type MobileTab = 'sala' | 'personaje' | 'chat';

export function LobbyPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { state, status, error, roomChat, join, leave } = useLobby();
  const conn = useConnection((s) => s.status);
  const [open, setOpen] = useState<LobbyParticipant | null>(null);
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState(false);
  const [tab, setTab] = useState<MobileTab>('sala');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void join(code);
  }, [code, join]);

  if (status === 'kicked' || status === 'closed' || status === 'error') {
    return (
      <main className="page page-narrow">
        <Empty title={status === 'kicked' ? 'No puedes entrar en esta sala' : status === 'closed' ? 'La sala se ha cerrado' : 'No se pudo entrar en la sala'}>
          <p>{error ?? 'Todos los jugadores la han abandonado.'}</p>
          <Link className="btn" to="/menu">
            Volver al menú
          </Link>
        </Empty>
      </main>
    );
  }
  if (!state || state.room.code !== code.toUpperCase()) {
    return (
      <div className="center-fill">
        <div className="stack" style={{ justifyItems: 'center' }}>
          <Spinner />
          <span className="muted">Entrando en la sala…</span>
        </div>
      </div>
    );
  }

  if (state.room.status === 'in_game' || state.room.status === 'finished') return <MatchPage lobby={state} />;

  const me = state.participants.find((p) => p.id === state.me.participantId) ?? null;
  const openParticipant = (p: LobbyParticipant) => (p.id === me?.id ? setEditing(true) : setOpen(p));
  // El participante abierto siempre se toma del estado más reciente.
  const live = open ? state.participants.find((p) => p.id === open.id) ?? null : null;
  const link = `${window.location.origin}/r/${state.room.code}`;
  const humans = state.participants.filter((p) => p.kind === 'human');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Enlace copiado');
    } catch {
      toast.info(`Código: ${state.room.code}`);
    }
  };
  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: state.room.name, text: `Únete a mi arena en Los Juegos de la Ceniza. Código ${state.room.code}`, url: link }).catch(() => undefined);
    } else void copy();
  };
  const addBot = async () => {
    setAdding(true);
    await act<{ botId: string }>('lobby:addBot', { cid: newCid() });
    setTimeout(() => setAdding(false), 250);
  };

  return (
    <main className="page lobby" data-tab={tab}>
      <header className="lobby-head">
        <div>
          <Link to="/menu" className="back">
            <ChevronLeft size={18} /> Menú (sigues en la sala)
          </Link>
          <h1 className="lobby-title">{state.room.name}</h1>
          <p className="muted small lobby-sub">
            Ritmo {PACE_LABEL[state.room.config.pace].toLowerCase()}, zona {ZONE_LABEL[state.room.config.zone].toLowerCase()}, {state.room.config.attributePoints} puntos de atributo.
            {conn !== 'online' && <span className="chip chip-ember"> Reconectando…</span>}
          </p>
        </div>
        <div className="lobby-code">
          <span className="label">Código</span>
          <span className="code-big num">{state.room.code}</span>
          <div className="row" style={{ gap: '0.4rem' }}>
            <button className="btn btn-sm" onClick={copy}>
              Copiar enlace
            </button>
            <button className="btn btn-sm" onClick={share}>
              Compartir
            </button>
          </div>
        </div>
      </header>

      <nav className="tabs lobby-tabs" role="tablist" aria-label="Secciones de la sala">
        {(
          [
            ['sala', `Sala (${state.participants.length}/${state.room.config.maxParticipants})`],
            ['personaje', 'Mi personaje'],
            ['chat', 'Chat'],
          ] as [MobileTab, string][]
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </nav>

      <div className="lobby-grid">
        <div className="lobby-left">
        <section className="panel panel-visor lobby-board" data-section="sala">
          <div className="panel-title">
            <h2>Tablero de distritos</h2>
            <div className="row" style={{ gap: '0.5rem' }}>
              <span className="muted small num">
                {state.participants.length}/{state.room.config.maxParticipants}
              </span>
              <button className="btn btn-sm btn-ghost" onClick={() => setSettings(true)}>
                {state.me.isHost ? 'Configurar' : 'Reglas'}
              </button>
            </div>
          </div>
          <DistrictBoard state={state} onOpen={openParticipant} />
        </section>

        <section className="panel lobby-people" data-section="sala">
          <div className="panel-title">
            <h2>Participantes</h2>
            <button className="btn btn-gold add-bot" onClick={addBot} disabled={!state.bots.canAdd || adding} title={state.bots.reason ?? 'Añade un participante controlado por IA'}>
              <Plus /> AÑADIR BOT
            </button>
          </div>
          {!state.bots.canAdd && state.bots.reason && <p className="hint">{state.bots.reason}</p>}
          <ParticipantList state={state} onOpen={openParticipant} />
          <p className="hint">
            Bots: {state.bots.total} de {state.room.config.botsMaxTotal} (tuyos: {state.bots.mine} de {state.room.config.botsMaxPerUser}). Toca un bot para editarlo.
          </p>
        </section>
        </div>

        <aside className="lobby-side">
          <section className="panel" data-section="personaje">
            <MyCharacter me={me} budget={state.room.config.attributePoints} onEdit={() => setEditing(true)} />
          </section>
          <section className="panel ready-panel" data-section="personaje">
            <ReadyBox
              me={me}
              start={state.start}
              autoStart={state.room.config.autoStart}
              humans={humans.length}
              readyCount={humans.filter((h) => h.ready).length}
            />
          </section>
          <section className="panel lobby-chat" data-section="chat">
            <h3>Chat de la sala</h3>
            <ChatPanel channel="room" messages={roomChat} placeholder="Escribe a la sala…" disabled={conn !== 'online'} />
          </section>
          <div data-section="personaje">
            <ConfirmButton
              className="btn btn-ghost"
              confirmText="¿Abandonar la sala? Pulsa otra vez"
              onConfirm={async () => {
                await leave();
                navigate('/menu');
              }}
            >
              Abandonar la sala
            </ConfirmButton>
          </div>
        </aside>
      </div>

      {live && live.kind === 'bot' && <BotEditor bot={live} state={state} onClose={() => setOpen(null)} />}
      {live && live.kind === 'human' && live.id !== me?.id && <HumanCard p={live} onClose={() => setOpen(null)} />}
      {editing && me && <MyEditor me={me} budget={state.room.config.attributePoints} onClose={() => setEditing(false)} />}
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
    </main>
  );
}

function MyCharacter({ me, budget, onEdit }: { me: LobbyParticipant | null; budget: number; onEdit: () => void }) {
  const { data: templates } = useTemplates();
  const qc = useQueryClient();
  const c = me?.character;
  const d = districtById(me?.slot.district);

  const saveAsTemplate = async () => {
    if (!c) return;
    try {
      await api.post('/api/characters', { data: c });
      await qc.invalidateQueries({ queryKey: keys.templates });
      toast.success('Guardado en tus personajes');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="stack">
      <div className="panel-title">
        <h2>Tu personaje</h2>
      </div>
      {c ? (
        <div className="mychar">
          <Portrait portrait={c.portrait} look={c.look} color={c.color} frame={c.frame} size={84} />
          <div>
            <div className="display mychar-name">{c.name}</div>
            {c.epithet && <div className="muted small">{c.epithet}</div>}
            <div className="small faint">{d ? `Distrito ${d.roman}, ${d.name}` : 'Sin distrito: elige plaza en el tablero'}</div>
          </div>
        </div>
      ) : (
        <p className="muted">Todavía no has elegido personaje. Carga uno guardado o crea uno nuevo para esta sala.</p>
      )}
      {me && me.buildIssues.length > 0 && (
        <ul className="issues">
          {me.buildIssues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      <div className="row" style={{ gap: '0.5rem' }}>
        <button className="btn" onClick={onEdit}>
          {c ? 'Editar' : 'Crear personaje'}
        </button>
        {c && (
          <button className="btn btn-ghost" onClick={saveAsTemplate} title="Guardar como plantilla reutilizable">
            Guardar como plantilla
          </button>
        )}
      </div>
      {!!templates?.length && (
        <label className="field">
          <span>Cargar un personaje guardado</span>
          <select className="select" value="" onChange={(e) => e.target.value && void act('lobby:applyTemplate', { templateId: e.target.value, cid: newCid() }, 'Personaje cargado')}>
            <option value="">Elige uno…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.data.name}
                {summarizeBuild(t.data, budget).valid ? '' : ' (necesita ajustes)'}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function SecondsLeft({ to }: { to: number }) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  return <span className="start-count num">{Math.max(0, Math.ceil((to - Date.now()) / 1000))}</span>;
}

function ReadyBox({ me, start, autoStart, humans, readyCount }: { me: LobbyParticipant | null; start: LobbyState['start']; autoStart: boolean; humans: number; readyCount: number }) {
  const ready = !!me?.ready;
  const { canStart, reasons } = start;
  return (
    <div className="stack">
      <button className={`btn btn-lg ready-btn${ready ? ' is-ready' : ' btn-primary'}`} onClick={() => void act('lobby:setReady', { ready: !ready })} disabled={!me}>
        {ready ? (
          <>
            Listo. Toca para cancelar
          </>
        ) : (
          <>
            Estoy listo
          </>
        )}
      </button>
      <div className="ready-count">
        <span className="num">
          {readyCount}/{humans}
        </span>{' '}
        <span className="muted small">humanos preparados</span>
      </div>
      {start.countdownEndsAt ? (
        <p className="start-ok">
          Todos preparados. La partida empieza en <SecondsLeft to={start.countdownEndsAt} /> s.
        </p>
      ) : canStart ? (
        <p className="start-ok">{autoStart ? 'Todos preparados.' : 'Todos preparados. El anfitrión decide cuándo empezar.'}</p>
      ) : (
        <ul className="reasons">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {start.canForce && !start.countdownEndsAt && (
        <div className="force-box">
          <button className="btn btn-gold" onClick={() => void act('lobby:forceStart', {})}>
            Empezar ya
          </button>
          <span className="hint">{canStart ? 'Empieza sin esperar.' : 'Empieza aunque falte gente por prepararse o esté desconectada: se aplica la regla de desconexión de la sala.'}</span>
        </div>
      )}
    </div>
  );
}

function MyEditor({ me, budget, onClose }: { me: LobbyParticipant; budget: number; onClose: () => void }) {
  const { data: user } = useMe();
  const [draft, setDraft] = useState<Character>(() => {
    if (me.character) return structuredClone(me.character);
    const base = defaultCharacter({ name: user?.displayName ?? 'Elegido', seed: user?.id ?? 'x' });
    return user?.defaultPhoto ? { ...base, portrait: { kind: 'photo', photoId: user.defaultPhoto.id, v: user.defaultPhoto.v } } : base;
  });
  const [busy, setBusy] = useState(false);
  const s = summarizeBuild(draft, budget);
  const save = async () => {
    setBusy(true);
    const r = await act('lobby:setCharacter', { character: draft, cid: newCid() }, 'Personaje actualizado');
    setBusy(false);
    if (r.ok) onClose();
  };
  return (
    <Modal
      title="Tu personaje en esta sala"
      onClose={onClose}
      width={1080}
      footer={
        <>
          {!s.valid && <span className="hint">Puedes guardarlo como borrador, pero no podrás prepararte hasta corregirlo.</span>}
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            Guardar en la sala
          </button>
        </>
      }
    >
      <CharacterEditor value={draft} onChange={setDraft} budget={budget} mode="room" />
    </Modal>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const state = useLobby((s) => s.state)!;
  const [draft, setDraft] = useState(state.room.config);
  const [name, setName] = useState(state.room.name);
  const host = state.me.isHost;
  const save = async () => {
    const patch: RoomConfigPatch = {};
    for (const k of Object.keys(draft) as (keyof typeof draft)[]) if (draft[k] !== state.room.config[k]) (patch as Record<string, unknown>)[k] = draft[k];
    const r = await act('lobby:updateConfig', { patch, ...(name !== state.room.name ? { name } : {}) }, 'Configuración guardada');
    if (r.ok) onClose();
  };
  return (
    <Modal
      title={host ? 'Configurar la sala' : 'Reglas de la sala'}
      onClose={onClose}
      width={760}
      footer={
        host ? (
          <>
            <span className="hint">Al guardar, todos tendrán que volver a pulsar «Estoy listo».</span>
            <button className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={save}>
              Guardar configuración
            </button>
          </>
        ) : (
          <button className="btn" onClick={onClose}>
            Cerrar
          </button>
        )
      }
    >
      {!host && <p className="hint">Solo el anfitrión puede cambiar las reglas. Tú puedes añadir bots, editar bots y preparar tu personaje.</p>}
      {host && (
        <label className="field" style={{ marginBottom: '1rem' }}>
          <span>Nombre de la sala</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </label>
      )}
      <RoomConfigForm value={draft} onChange={(p) => setDraft(mergeRoomConfig(draft, p))} readOnly={!host} minParticipants={state.participants.length} />
    </Modal>
  );
}
