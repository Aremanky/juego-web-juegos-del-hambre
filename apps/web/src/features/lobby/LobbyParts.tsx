import { useEffect, useState } from 'react';
import { Crown, UserRoundX } from 'lucide-react';
import {
  DIFFICULTIES, DIFFICULTY_KEYS, DISTRICTS, GENDER_LABEL, PERSONALITIES, PERSONALITY_KEYS, PLAYSTYLES, PLAYSTYLE_KEYS, districtById,
  type BotSettings, type Character, type Gender, type LobbyParticipant, type LobbyState,
} from '@ceniza/shared';
import { ConfirmButton, Modal, Portrait, Segmented } from '../../components/ui';
import { emitAck, newCid, SocketFailure } from '../../lib/socket';
import { toast } from '../../stores/toast';
import { CharacterEditor } from '../characters/CharacterEditor';

export const charOf = (p: LobbyParticipant) => p.character ?? p.publicCharacter;
export const nameOf = (p: LobbyParticipant) => charOf(p)?.name ?? p.displayName ?? 'Sin personaje';

export type ActResult<T> = { ok: true; data: T } | { ok: false };

/** Envía un comando al servidor y muestra el resultado; nunca lanza. */
export async function act<T = undefined>(event: Parameters<typeof emitAck>[0], payload: unknown, okText?: string): Promise<ActResult<T>> {
  try {
    const data = await emitAck<T>(event, payload);
    if (okText) toast.success(okText);
    return { ok: true, data };
  } catch (e) {
    toast.error(e instanceof SocketFailure ? e.message : 'No se pudo completar la acción');
    return { ok: false };
  }
}

// ───────────────────────────────────────────────────────── tablero de distritos
export function DistrictBoard({ state, onOpen }: { state: LobbyState; onOpen: (p: LobbyParticipant) => void }) {
  const me = state.participants.find((p) => p.id === state.me.participantId);
  const myGender = me?.slot.gender ?? null;
  const bySlot = new Map<string, LobbyParticipant>();
  for (const p of state.participants) if (p.slot.district && p.slot.gender) bySlot.set(`${p.slot.district}${p.slot.gender}`, p);
  const unplaced = state.participants.filter((p) => !p.slot.district);

  const claim = (district: number) => void act('lobby:setSlot', { district });

  const slot = (d: number, g: Gender) => {
    const p = bySlot.get(`${d}${g}`);
    if (p) {
      const c = charOf(p);
      return (
        <button key={g} type="button" className={`slot filled${p.ready ? ' ready' : ''}${p.online ? '' : ' offline'}${p.id === me?.id ? ' mine' : ''}`} onClick={() => onOpen(p)} title={`${nameOf(p)}${p.kind === 'bot' ? ' (bot)' : ''}`}>
          <Portrait portrait={c?.portrait} look={c?.look} color={c?.color ?? '#888'} frame={c?.frame ?? 'sencillo'} size={46} bot={p.kind === 'bot'} host={p.isHost} grayscale={!p.online} />
          <span className="slot-name">{nameOf(p)}</span>
        </button>
      );
    }
    const canClaim = !!me?.character && myGender === g && state.room.status === 'lobby';
    return (
      <button key={g} type="button" className={`slot empty${canClaim ? ' claimable' : ''}`} disabled={!canClaim} onClick={() => claim(d)} aria-label={`Distrito ${d}, plaza ${GENDER_LABEL[g].toLowerCase()}${canClaim ? ': ocupar' : ': libre'}`}>
        <span className="slot-ring" />
        {canClaim && <span className="slot-name">Ocupar</span>}
      </button>
    );
  };

  return (
    <div className="board-wrap">
      <div className="board" role="grid" aria-label="Tablero de distritos">
        <div className="board-axis" aria-hidden="true">
          <span />
          <span>Fem.</span>
          <span>Masc.</span>
        </div>
        {DISTRICTS.map((d) => (
          <div key={d.id} className="board-col" style={{ ['--dc' as string]: d.color }} role="row">
            <div className="board-head" title={`${d.name}: ${d.perk}`}>
              <span className="display board-num">{d.roman}</span>
              <span className="board-dname">{d.name}</span>
            </div>
            {slot(d.id, 'F')}
            {slot(d.id, 'M')}
          </div>
        ))}
      </div>
      {unplaced.length > 0 && (
        <div className="unplaced">
          <span className="label">Sin plaza todavía (se asignará al empezar):</span>
          {unplaced.map((p) => {
            const c = charOf(p);
            return (
              <button key={p.id} type="button" className="unplaced-item" onClick={() => onOpen(p)}>
                <Portrait portrait={c?.portrait} look={c?.look} color={c?.color ?? '#888'} frame="sencillo" size={30} bot={p.kind === 'bot'} grayscale={!p.online} />
                <span className="small">{nameOf(p)}</span>
              </button>
            );
          })}
        </div>
      )}
      {me && !me.character && <p className="hint">Elige tu personaje para poder ocupar una plaza.</p>}
      {me?.character && !me.slot.district && <p className="hint">Toca una plaza libre de tu fila para elegir distrito.</p>}
    </div>
  );
}

// ───────────────────────────────────────────────────────── lista de participantes
export function ParticipantList({ state, onOpen }: { state: LobbyState; onOpen: (p: LobbyParticipant) => void }) {
  const isHost = state.me.isHost;
  return (
    <ul className="plist">
      {state.participants.map((p) => {
        const c = charOf(p);
        const d = districtById(p.slot.district);
        return (
          <li key={p.id} className={`prow${p.id === state.me.participantId ? ' mine' : ''}`}>
            <button type="button" className="prow-main" onClick={() => onOpen(p)}>
              <Portrait portrait={c?.portrait} look={c?.look} color={c?.color ?? '#888'} frame={c?.frame ?? 'sencillo'} size={40} bot={p.kind === 'bot'} host={p.isHost} grayscale={!p.online} />
              <span className="prow-text">
                <strong>{nameOf(p)}</strong>
                <span className="small muted">
                  {p.kind === 'bot' ? `Bot ${PERSONALITIES[p.bot!.personality].name.toLowerCase()}, ${DIFFICULTIES[p.bot!.difficulty].name.toLowerCase()}. Lo añadió ${p.addedBy?.displayName ?? '—'}` : `${p.displayName}${p.isHost ? ', anfitrión' : ''}`}
                </span>
              </span>
            </button>
            <span className="prow-tags">
              {d && <span className="chip display" title={d.name}>{d.roman}</span>}
              {p.kind === 'human' && !p.online && <span className="chip">Desconectado</span>}
              {p.kind === 'human' && !p.buildValid && p.character !== null && <span className="chip chip-blood">Personaje no válido</span>}
              {p.kind === 'human' && (p.ready ? <span className="chip chip-holo">Listo</span> : <span className="chip">Preparándose</span>)}
            </span>
            {isHost && p.kind === 'human' && p.id !== state.me.participantId && (
              <span className="prow-actions">
                <ConfirmButton className="btn btn-sm btn-ghost" confirmText="¿Ceder?" onConfirm={() => void act('lobby:transferHost', { userId: p.userId }, 'Has cedido el puesto de anfitrión')}>
                  <Crown size={16} />
                  <span className="sr-only">Ceder anfitrión</span>
                </ConfirmButton>
                <ConfirmButton className="btn btn-sm btn-danger" confirmText="¿Expulsar?" onConfirm={() => void act('lobby:kick', { participantId: p.id })}>
                  <UserRoundX size={16} />
                  <span className="sr-only">Expulsar</span>
                </ConfirmButton>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ───────────────────────────────────────────────────────── ficha de humano (solo lectura)
export function HumanCard({ p, onClose }: { p: LobbyParticipant; onClose: () => void }) {
  const c = charOf(p);
  const d = districtById(p.slot.district);
  return (
    <Modal title={nameOf(p)} onClose={onClose} width={440}>
      <div className="stack" style={{ justifyItems: 'center', textAlign: 'center' }}>
        <Portrait portrait={c?.portrait} look={c?.look} color={c?.color ?? '#888'} frame={c?.frame ?? 'sencillo'} size={128} host={p.isHost} grayscale={!p.online} />
        {c?.epithet && <p className="muted">{c.epithet}</p>}
        <p className="small">
          Jugador: {p.displayName}. {d ? `Distrito ${d.roman}, ${d.name}.` : 'Sin distrito asignado.'} {p.online ? 'Conectado.' : 'Desconectado.'}
        </p>
        {c?.bio && <blockquote className="bio">{c.bio}</blockquote>}
        <p className="hint">Sus atributos y habilidades son secretos hasta el final de la partida.</p>
      </div>
    </Modal>
  );
}

// ───────────────────────────────────────────────────────── editor de bots
export function BotEditor({ bot, state, onClose }: { bot: LobbyParticipant; state: LobbyState; onClose: () => void }) {
  const [draft, setDraft] = useState<Character>(bot.character!);
  const [settings, setSettings] = useState<BotSettings>(bot.bot!);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const canEdit = state.room.config.botsWhoCanAdd === 'todos' || state.me.isHost;
  const canRemove = bot.addedBy?.userId === state.me.userId || state.me.isHost;

  // Si otro jugador lo cambia (o regeneramos), refrescamos mientras no haya cambios locales.
  useEffect(() => {
    if (!dirty && bot.character) {
      setDraft(bot.character);
      setSettings(bot.bot!);
    }
  }, [bot.character, bot.bot, dirty]);

  const save = async () => {
    setBusy(true);
    const r = await act('lobby:updateBot', { botId: bot.id, character: draft, settings, cid: newCid() }, 'Bot actualizado');
    setBusy(false);
    if (r.ok) setDirty(false);
  };
  const reroll = (what: 'attributes' | 'identity' | 'avatar' | 'all') => {
    setDirty(false);
    void act('lobby:rerollBot', { botId: bot.id, what });
  };

  return (
    <Modal
      title={
        <span className="row" style={{ gap: '0.5rem' }}>
          {draft.name}
        </span>
      }
      onClose={onClose}
      width={1080}
      footer={
        <>
          {canRemove && (
            <ConfirmButton
              onConfirm={() => {
                void act('lobby:removeBot', { botId: bot.id }, 'Bot retirado');
                onClose();
              }}
              confirmText="¿Retirarlo?"
            >
              Retirar bot
            </ConfirmButton>
          )}
          <span className="spacer" />
          <span className="hint">
            Lo añadió {bot.addedBy?.displayName ?? '—'}
            {bot.lastEditedBy ? `. Último cambio: ${bot.lastEditedBy}` : ''}.
          </span>
          <button className="btn btn-ghost" onClick={onClose}>
            Cerrar
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!canEdit || !dirty || busy}>
            Guardar cambios
          </button>
        </>
      }
    >
      {!canEdit && <p className="hint">El anfitrión ha restringido la edición de bots.</p>}
      <fieldset disabled={!canEdit} className="bare-fieldset stack">
        <div className="bot-ai panel-quiet">
          <div className="field">
            <span>Dificultad (calidad de sus decisiones, no sus estadísticas)</span>
            <Segmented
              label="Dificultad"
              value={settings.difficulty}
              options={DIFFICULTY_KEYS.map((k) => ({ value: k, label: DIFFICULTIES[k].name, title: DIFFICULTIES[k].description }))}
              onChange={(v) => {
                setSettings({ ...settings, difficulty: v });
                setDirty(true);
              }}
            />
          </div>
          <div className="grid-2">
            <label className="field">
              <span>Personalidad</span>
              <select
                className="select"
                value={settings.personality}
                onChange={(e) => {
                  setSettings({ ...settings, personality: e.target.value as BotSettings['personality'] });
                  setDirty(true);
                }}
              >
                {PERSONALITY_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {PERSONALITIES[k].name}
                  </option>
                ))}
              </select>
              <span className="hint">{PERSONALITIES[settings.personality].description}</span>
            </label>
            <label className="field">
              <span>Estilo de juego</span>
              <select
                className="select"
                value={settings.playstyle}
                onChange={(e) => {
                  setSettings({ ...settings, playstyle: e.target.value as BotSettings['playstyle'] });
                  setDirty(true);
                }}
              >
                {PLAYSTYLE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {PLAYSTYLES[k].name}
                  </option>
                ))}
              </select>
              <span className="hint">{PLAYSTYLES[settings.playstyle].description}</span>
            </label>
          </div>
          <div className="row" style={{ gap: '0.5rem' }}>
            <button type="button" className="btn btn-sm" onClick={() => reroll('attributes')}>
              Reequilibrar atributos
            </button>
            <button type="button" className="btn btn-sm" onClick={() => reroll('identity')}>
              Otra identidad
            </button>
            <button type="button" className="btn btn-sm" onClick={() => reroll('avatar')}>
              Otra cara
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => reroll('all')}>
              Todo nuevo
            </button>
          </div>
        </div>
        <CharacterEditor
          value={draft}
          onChange={(c) => {
            setDraft(c);
            setDirty(true);
          }}
          budget={state.room.config.attributePoints}
          mode="bot"
        />
      </fieldset>
    </Modal>
  );
}
