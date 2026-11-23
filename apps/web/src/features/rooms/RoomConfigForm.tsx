import { Minus, Plus } from 'lucide-react';
import { DIFFICULTIES, DIFFICULTY_KEYS, EVENTS_LABEL, MAPSIZE_LABEL, PACE_LABEL, ZONE_LABEL, type RoomConfig, type RoomConfigPatch } from '@ceniza/shared';
import { Segmented, Switch } from '../../components/ui';

function Stepper({ value, min, max, onChange, disabled, label }: { value: number; min: number; max: number; onChange: (v: number) => void; disabled?: boolean; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="btn btn-icon btn-sm" disabled={disabled || value <= min} onClick={() => onChange(value - 1)} aria-label={`Menos ${label}`}>
        <Minus />
      </button>
      <span className="num stepper-v">{value}</span>
      <button type="button" className="btn btn-icon btn-sm" disabled={disabled || value >= max} onClick={() => onChange(value + 1)} aria-label={`Más ${label}`}>
        <Plus />
      </button>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="cfg-row">
      <div>
        <div className="cfg-label">{label}</div>
        {hint && <div className="hint">{hint}</div>}
      </div>
      <div className="cfg-control">{children}</div>
    </div>
  );
}

const opts = <T extends string>(labels: Record<T, string>) => (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));

export function RoomConfigForm({ value: c, onChange, readOnly, minParticipants = 2 }: { value: RoomConfig; onChange: (p: RoomConfigPatch) => void; readOnly?: boolean; minParticipants?: number }) {
  const d = readOnly;
  return (
    <div className="cfg">
      <section>
        <h3>Partida</h3>
        <Row label="Participantes máximos" hint="Humanos y bots, hasta 24 (12 distritos × 2 plazas).">
          <Stepper label="participantes" value={c.maxParticipants} min={Math.max(2, minParticipants)} max={24} onChange={(v) => onChange({ maxParticipants: v })} disabled={d} />
        </Row>
        <Row label="Ritmo" hint={c.pace === 'ilimitada' ? 'Sin límite de tiempo: termina cuando queda uno.' : 'Duración aproximada: rápida 15–25 min, estándar 30–50, larga 1–2 h.'}>
          <Segmented label="Ritmo" value={c.pace} options={opts(PACE_LABEL)} onChange={(v) => onChange(v === 'ilimitada' && c.zone !== 'desactivada' ? { pace: v, zone: 'desactivada' } : { pace: v })} disabled={d} />
        </Row>
        <Row label="Zona segura que se cierra">
          <Segmented label="Zona" value={c.zone} options={opts(ZONE_LABEL)} onChange={(v) => onChange({ zone: v })} disabled={d} />
        </Row>
        <Row label="Tamaño del mapa">
          <Segmented label="Mapa" value={c.mapSize} options={opts(MAPSIZE_LABEL)} onChange={(v) => onChange({ mapSize: v })} disabled={d} />
        </Row>
        <Row label="Visibilidad" hint={c.visibility === 'visible' ? 'Todos ven a quien no esté escondido.' : 'Cada uno ve solo lo que percibe y lo de sus aliados.'}>
          <Segmented
            label="Visibilidad"
            value={c.visibility}
            options={[
              { value: 'visible', label: 'Visible' },
              { value: 'niebla', label: 'Niebla de guerra' },
            ]}
            onChange={(v) => onChange({ visibility: v })}
            disabled={d}
          />
        </Row>
        <Row label="Intensidad de eventos">
          <Segmented label="Eventos" value={c.eventIntensity} options={opts(EVENTS_LABEL)} onChange={(v) => onChange({ eventIntensity: v })} disabled={d} />
        </Row>
      </section>

      <section>
        <h3>Reglas</h3>
        <Row label="Puntos de atributo" hint="Si los bajas, los bots se reequilibran y los humanos deberán ajustar su personaje.">
          <Segmented
            label="Puntos"
            value={c.attributePoints}
            options={[
              { value: 24, label: '24' },
              { value: 28, label: '28' },
              { value: 32, label: '32' },
            ]}
            onChange={(v) => onChange({ attributePoints: v as 24 | 28 | 32 })}
            disabled={d}
          />
        </Row>
        <Row label="Equipo inicial">
          <Segmented
            label="Equipo inicial"
            value={c.startingKit}
            options={[
              { value: 'ninguno', label: 'Ninguno' },
              { value: 'basico', label: 'Básico' },
            ]}
            onChange={(v) => onChange({ startingKit: v })}
            disabled={d}
          />
        </Row>
        <Row label="Tamaño máximo de alianza">
          <Stepper label="miembros por alianza" value={c.allianceMaxSize} min={2} max={6} onChange={(v) => onChange({ allianceMaxSize: v })} disabled={d} />
        </Row>
        <Row label="Chat durante la partida">
          <Segmented
            label="Chat de partida"
            value={c.matchChat}
            options={[
              { value: 'desactivado', label: 'Desactivado' },
              { value: 'alianza', label: 'Solo alianza' },
              { value: 'todos', label: 'Todos' },
            ]}
            onChange={(v) => onChange({ matchChat: v })}
            disabled={d}
          />
        </Row>
        <Row label="Victoria de distrito" hint="Si los dos últimos vivos son del mismo distrito, ganan juntos.">
          <Switch checked={c.districtVictory} onChange={(v) => onChange({ districtVictory: v })} label={c.districtVictory ? 'Activada' : 'Desactivada'} disabled={d} />
        </Row>
      </section>

      <section>
        <h3>Bots</h3>
        <Row label="Quién puede añadir y editar bots">
          <Segmented
            label="Quién añade bots"
            value={c.botsWhoCanAdd}
            options={[
              { value: 'todos', label: 'Cualquiera' },
              { value: 'anfitrion', label: 'Solo el anfitrión' },
            ]}
            onChange={(v) => onChange({ botsWhoCanAdd: v })}
            disabled={d}
          />
        </Row>
        <Row label="Máximo de bots en la sala">
          <Stepper label="bots en total" value={c.botsMaxTotal} min={0} max={23} onChange={(v) => onChange({ botsMaxTotal: v })} disabled={d} />
        </Row>
        <Row label="Máximo de bots por persona">
          <Stepper label="bots por persona" value={c.botsMaxPerUser} min={1} max={23} onChange={(v) => onChange({ botsMaxPerUser: v })} disabled={d} />
        </Row>
        <Row label="Dificultad por defecto" hint={DIFFICULTIES[c.botsDefaultDifficulty].description}>
          <Segmented label="Dificultad" value={c.botsDefaultDifficulty} options={DIFFICULTY_KEYS.map((k) => ({ value: k, label: DIFFICULTIES[k].name }))} onChange={(v) => onChange({ botsDefaultDifficulty: v })} disabled={d} />
        </Row>
        <Row label="Prioridad humana" hint="Si la sala está llena, un humano que entra ocupa la plaza del último bot.">
          <Switch checked={c.humanPriority} onChange={(v) => onChange({ humanPriority: v })} label={c.humanPriority ? 'Sí' : 'No'} disabled={d} />
        </Row>
      </section>

      <section>
        <h3>Conexión y pausas</h3>
        <Row label="Si alguien se desconecta">
          <Segmented
            label="Desconexión"
            value={c.disconnectPolicy}
            options={[
              { value: 'piloto', label: 'Piloto automático' },
              { value: 'proteger', label: 'Se esconde' },
              { value: 'eliminar', label: 'Eliminado' },
            ]}
            onChange={(v) => onChange({ disconnectPolicy: v })}
            disabled={d}
          />
        </Row>
        {c.disconnectPolicy === 'eliminar' && (
          <Row label="Minutos de margen antes de eliminar">
            <Stepper label="minutos" value={c.disconnectGraceMin} min={1} max={60} onChange={(v) => onChange({ disconnectGraceMin: v })} disabled={d} />
          </Row>
        )}
        <Row label="Empezar solo cuando todos estén listos" hint="Así no hace falta que el anfitrión pulse nada.">
          <Switch checked={c.autoStart} onChange={(v) => onChange({ autoStart: v })} label={c.autoStart ? 'Sí' : 'No'} disabled={d} />
        </Row>
        <Row label="Pausar la partida por votación">
          <Segmented
            label="Pausa"
            value={c.pauseVote}
            options={[
              { value: 'mayoria', label: 'Por mayoría' },
              { value: 'unanimidad', label: 'Por unanimidad' },
            ]}
            onChange={(v) => onChange({ pauseVote: v })}
            disabled={d}
          />
        </Row>
        <Row label="Semilla del mapa" hint="Déjala vacía para un mapa aleatorio, o repite una semilla para volver a jugar la misma arena.">
          <input className="input" style={{ maxWidth: 220 }} value={c.seed} maxLength={32} onChange={(e) => onChange({ seed: e.target.value })} disabled={d} placeholder="Aleatoria" />
        </Row>
      </section>
    </div>
  );
}
